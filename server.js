require('dotenv').config()

const express = require('express')
const cors = require('cors')
const path = require('path')
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const fileUpload = require('express-fileupload')
const db = require('./server-db')
const app = express()
const iconv = require('iconv-lite')
const chardet = require('chardet')

// 启用 CORS 和 JSON 解析
app.use(cors())
app.use(express.json())

// 启用文件上传中间件
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 限制文件大小为 50MB
    useTempFiles: true,
    tempFileDir: '/tmp/'
}))

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
    next()
})

// AnythingLLM API 端点
const ANYTHING_LLM_BASE_URL = 'http://localhost:3001'
const DEFAULT_WORKSPACE_SLUG = 'default'  // 默认工作区

// 获取API客户端实例
async function getApiClient() {
    const apiKey = await db.getConfig('anythingllm_api_key')
    if (!apiKey) {
        throw new Error('AnythingLLM API Key not configured')
    }
    
    return axios.create({
        baseURL: ANYTHING_LLM_BASE_URL,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        }
    })
}

// 检查 AnythingLLM 服务是否可用
async function checkAnythingLLMService() {
    try {
        const apiClient = await getApiClient()
        const response = await apiClient.get('/api/v1/auth')
        console.log('AnythingLLM service check response:', response.status)
        return response.data
    } catch (error) {
        console.error('AnythingLLM service is not available:', error.message)
        if (error.response?.status === 403) {
            throw new Error('API Key 无效或未设置')
        }
        throw error
    }
}

// 获取工作区信息
async function getWorkspaceInfo(workspaceSlug = DEFAULT_WORKSPACE_SLUG) {
    try {
        const apiClient = await getApiClient()
        const response = await apiClient.get(`/api/v1/workspace/${workspaceSlug}`)
        return response.data
    } catch (error) {
        console.error(`Error getting workspace info for ${workspaceSlug}:`, error.message)
        return null
    }
}

// 创建工作区
async function createWorkspaceIfNotExists(apiClient, workspaceSlug = DEFAULT_WORKSPACE_SLUG) {
    try {
        console.log('Checking workspace:', workspaceSlug)
        // 检查工作区是否存在
        const workspaceResponse = await apiClient.get(`/api/v1/workspace/${workspaceSlug}`)
        console.log('Workspace exists:', workspaceSlug)
        return workspaceResponse.data
    } catch (error) {
        if (error.response?.status === 404) {
            console.log('Creating new workspace:', workspaceSlug)
            try {
                // 工作区不存在，创建新的
                const response = await apiClient.post('/api/v1/workspace/new', {
                    name: workspaceSlug
                })
                console.log('Workspace created successfully:', response.data)
                return response.data.workspace
            } catch (createError) {
                console.error('Failed to create workspace:', {
                    error: createError.message,
                    response: createError.response?.data,
                    status: createError.response?.status
                })
                throw createError
            }
        }
        console.error('Error checking workspace:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        throw error
    }
}

// 代理 AnythingLLM API 请求
app.post('/generate-questions', async (req, res) => {
    try {
        console.log('Generating questions with:', req.body)
        
        // 确保工作区存在
        const workspace = await getWorkspaceInfo()
        if (!workspace) {
            throw new Error('Workspace not found or not accessible')
        }

        const apiClient = await getApiClient()
        const response = await apiClient.post(
            `/api/v1/workspace/${DEFAULT_WORKSPACE_SLUG}/chat`,
            {
                message: req.body.prompt,
                model: req.body.model || 'llama2',
                temperature: 0.7,
                stream: false
            }
        )
        
        res.json(response.data)
    } catch (error) {
        console.error('Error calling AnythingLLM API:', error)
        res.status(error.response?.status || 500).json({
            error: 'Failed to generate questions',
            details: error.message,
            response: error.response?.data
        })
    }
})

// 从工作区删除文件
app.delete('/workspaces/:slug/files/:fileId', async (req, res) => {
    try {
        const { slug, fileId } = req.params
        console.log('Deleting file from workspace:', { slug, fileId })

        const apiClient = await getApiClient()

        // 1. 获取工作区详情，找到要删除的文件
        const workspaceResponse = await apiClient.get(`/api/v1/workspace/${slug}`)
        const documents = workspaceResponse.data.workspace?.documents || []
        const documentToDelete = documents.find(doc => doc.id === fileId)

        if (!documentToDelete) {
            return res.status(404).json({
                error: 'File not found in workspace',
                fileId
            })
        }

        // 2. 从工作区解绑文件
        console.log('Unbinding file from workspace:', { slug, document: documentToDelete.location })
        const response = await apiClient.post(`/api/v1/workspace/${slug}/update-embeddings`, {
            adds: [],
            deletes: [documentToDelete.location]
        })
        console.log('File unbound from workspace successfully:', response.data)

        res.json(response.data)
    } catch (error) {
        console.error('Error deleting file:', {
            slug: req.params.slug,
            fileId: req.params.fileId,
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to delete file',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 工作区相关路由
app.get('/workspaces', async (req, res) => {
    try {
        const apiClient = await getApiClient()
        const response = await apiClient.get('/api/v1/workspaces')
        console.log('Got workspaces:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error getting workspaces:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        // 如果获取失败，返回空数组而不是错误
        res.json([])
    }
})

app.get('/workspaces/:slug', async (req, res) => {
    try {
        const { slug } = req.params
        console.log('Getting workspace:', slug)
        
        const apiClient = await getApiClient()
        const response = await apiClient.get(`/api/v1/workspace/${slug}`)
        console.log('Got workspace:', response.data)
        res.json(response.data)
    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Workspace not found'
            })
        }
        console.error('Error getting workspace:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        res.status(500).json({
            error: 'Failed to get workspace',
            message: error.message
        })
    }
})

app.post('/workspaces', async (req, res) => {
    try {
        const { name } = req.body
        console.log('Creating workspace:', { name })
        
        if (!name) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Name is required'
            })
        }

        const apiClient = await getApiClient()
        
        // 创建新工作区
        console.log('Creating new workspace in AnythingLLM')
        const response = await apiClient.post('/api/v1/workspace/new', {
            name
        })
        
        console.log('Workspace created successfully:', response.data)
        if (response.data.workspace) {
            return res.json(response.data.workspace)
        }
        
        // 如果响应中没有 workspace 对象，返回整个响应数据
        res.json(response.data)
    } catch (error) {
        console.error('Error creating workspace:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        
        if (error.response?.status === 409 && error.response?.data?.slug) {
            // 如果工作区已存在，尝试再次获取
            try {
                const apiClient = await getApiClient()
                const existingWorkspace = await apiClient.get(`/api/v1/workspace/${error.response.data.slug}`)
                if (existingWorkspace.data.workspace) {
                    return res.json(existingWorkspace.data.workspace)
                }
                return res.json(existingWorkspace.data)
            } catch (retryError) {
                console.error('Failed to get existing workspace after conflict:', retryError)
            }
        }
        
        res.status(500).json({
            error: 'Failed to create workspace',
            message: error.message,
            details: error.response?.data
        })
    }
})

app.get('/workspaces/:slug/files', async (req, res) => {
    try {
        const { slug } = req.params
        if (!slug) {
            return res.status(400).json({
                error: 'Workspace slug is required'
            })
        }

        console.log('Getting workspace details:', slug)
        const apiClient = await getApiClient()
        
        try {
            const workspaceResponse = await apiClient.get(`/api/v1/workspace/${slug}`)
            console.log('Got workspace details:', workspaceResponse.data)
            
            // 从工作区详情中获取文件列表
            const documents = workspaceResponse.data.workspace?.documents || []
            console.log('Workspace documents:', documents)
            
            res.json({ documents })
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('Workspace not found:', slug)
                return res.status(404).json({
                    error: 'Workspace not found',
                    slug: slug
                })
            }
            throw error
        }
    } catch (error) {
        console.error('Error getting workspace files:', {
            slug: req.params.slug,
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to get workspace files',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 专业相关路由
app.get('/professions', async (req, res) => {
    try {
        const professions = await db.getProfessions()
        res.json(professions)
    } catch (error) {
        console.error('Error getting professions:', error)
        res.status(500).json({
            error: 'Failed to get professions',
            details: error.message
        })
    }
})

app.post('/professions', async (req, res) => {
    try {
        const { name } = req.body
        if (!name) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Profession name is required'
            })
        }
        
        const id = await db.addProfession(name)
        res.json({ id, name })
    } catch (error) {
        console.error('Error adding profession:', error)
        res.status(500).json({
            error: 'Failed to add profession',
            details: error.message
        })
    }
})

// 配置相关路由
app.get('/config/:key', async (req, res) => {
    try {
        const { key } = req.params
        console.log('Getting config:', key)
        
        const value = await db.getConfig(key)
        console.log('Config value:', value)
        
        res.json(value)
    } catch (error) {
        console.error('Error getting config:', error)
        res.status(500).json({
            error: 'Failed to get config',
            message: error.message
        })
    }
})

app.post('/config/:key', async (req, res) => {
    try {
        const { key } = req.params
        const { value } = req.body
        console.log('Setting config:', { key, value })
        
        if (value === undefined) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Value is required'
            })
        }

        await db.setConfig(key, value)
        console.log('Config set successfully')
        
        res.json({ success: true })
    } catch (error) {
        console.error('Error setting config:', error)
        res.status(500).json({
            error: 'Failed to set config',
            message: error.message
        })
    }
})

// 添加测试路由
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running' })
})

// 代理文件上传请求
app.post('/api/v1/document/upload', async (req, res) => {
    let tempFilePath = null
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        const uploadedFile = req.files.file
        console.log('Received file:', {
            name: uploadedFile.name,
            size: uploadedFile.size,
            mimetype: uploadedFile.mimetype
        })

        // 创建临时目录（如果不存在）
        const tempDir = path.join(__dirname, 'temp')
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir)
        }

        // 使用原始文件名创建临时文件
        const originalName = decodeURIComponent(uploadedFile.name)
        tempFilePath = path.join(tempDir, originalName)
        
        // 如果临时目录中已存在同名文件，先删除
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath)
        }
        
        // 将上传的文件保存到临时文件
        await uploadedFile.mv(tempFilePath)
        
        console.log('File saved to temp location:', {
            originalName,
            tempPath: tempFilePath
        })

        const apiClient = await getApiClient()
        
        // 创建新的 FormData 来转发文件
        const formData = new FormData()
        
        // 使用文件流来上传文件
        const fileStream = fs.createReadStream(tempFilePath)
        formData.append('file', fileStream, {
            filename: encodeURIComponent(originalName),
            contentType: uploadedFile.mimetype || 'text/plain'
        })

        console.log('Forwarding file to AnythingLLM:', {
            filename: originalName,
            mimetype: uploadedFile.mimetype
        })

        const response = await apiClient.post('/api/v1/document/upload', formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        })

        console.log('AnythingLLM response:', response.data)

        if (!response.data.success) {
            throw new Error('Upload failed: ' + JSON.stringify(response.data))
        }

        res.json(response.data)
    } catch (error) {
        console.error('Error uploading file:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        
        res.status(500).json({
            error: 'Failed to upload file',
            message: error.message,
            details: {
                response: error.response?.data,
                status: error.response?.status
            }
        })
    } finally {
        // 清理临时文件
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath)
                console.log('Temporary file cleaned up:', tempFilePath)
            } catch (error) {
                console.error('Error cleaning up temporary file:', error)
            }
        }
    }
})

// 代理获取文档列表请求
app.get('/api/v1/documents', async (req, res) => {
    try {
        console.log('Getting documents list from AnythingLLM')
        
        const apiClient = await getApiClient()
        const response = await apiClient.get('/api/v1/documents')

        console.log('Documents list response:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error getting documents:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to get documents',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 代理工作区嵌入更新请求
app.post('/api/v1/workspace/:slug/update-embeddings', async (req, res) => {
    try {
        const { slug } = req.params
        const { adds = [], deletes = [] } = req.body

        console.log('Updating workspace embeddings:', {
            workspace: slug,
            adds,
            deletes
        })

        const apiClient = await getApiClient()
        const response = await apiClient.post(`/api/v1/workspace/${slug}/update-embeddings`, {
            adds,
            deletes
        })

        console.log('Workspace embeddings updated:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error updating workspace embeddings:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to update workspace embeddings',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 工作区绑定路由
app.post('/api/v1/workspace/:slug/bind', async (req, res) => {
    try {
        const { slug } = req.params
        const { documentId } = req.body

        console.log('Binding document to workspace:', {
            workspace: slug,
            documentId
        })

        const apiClient = await getApiClient()
        const response = await apiClient.post(`/api/v1/workspace/${slug}/bind`, {
            documentId
        })

        console.log('Workspace bound successfully:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error binding workspace:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to bind workspace',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 代理获取工作区信息请求
app.get('/api/v1/workspace/:slug', async (req, res) => {
    try {
        const { slug } = req.params
        console.log('Getting workspace information:', { slug })
        
        const apiClient = await getApiClient()
        const response = await apiClient.get(`/api/v1/workspace/${slug}`)

        console.log('Workspace information response:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error getting workspace information:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            stack: error.stack
        })
        res.status(error.response?.status || 500).json({
            error: 'Failed to get workspace information',
            message: error.message,
            details: error.response?.data
        })
    }
})

// 代理 auth 请求
app.get('/api/v1/auth', async (req, res) => {
    try {
        const apiClient = await getApiClient()
        const response = await apiClient.get('/api/v1/auth')
        res.json(response.data)
    } catch (error) {
        console.error('Auth check failed:', error.message)
        if (error.response?.status === 403) {
            res.status(403).json({ message: 'Invalid API Key' })
        } else {
            res.status(500).json({ message: 'Service unavailable' })
        }
    }
})

// 代理 workspaces 请求
app.get('/api/workspaces', async (req, res) => {
    try {
        const apiClient = await getApiClient()
        const response = await apiClient.get('/api/v1/workspaces')
        res.json(response.data)
    } catch (error) {
        console.error('Failed to get workspaces:', error.message)
        res.status(500).json({ message: 'Failed to get workspaces' })
    }
})

// 添加工作区聊天路由
app.post('/api/v1/workspace/:workspaceSlug/chat', async (req, res) => {
    try {
        const { workspaceSlug } = req.params
        const { message, mode } = req.body
        console.log('Workspace chat request:', { workspaceSlug, message, mode })

        const apiClient = await getApiClient()
        const response = await apiClient.post(`/api/v1/workspace/${workspaceSlug}/chat`, {
            message,
            mode
        })

        console.log('Chat response:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error in workspace chat:', error.response?.data || error)
        res.status(error.response?.status || 500).json({
            error: error.message,
            details: error.response?.data
        })
    }
})

const PORT = process.env.PORT || 3002

// 确保服务器正确关闭
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...')
    server.close(() => {
        console.log('Server closed')
        process.exit(0)
    })
})

process.on('SIGINT', () => {
    console.log('SIGINT received. Closing server...')
    server.close(() => {
        console.log('Server closed')
        process.exit(0)
    })
})
