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

// 根据题目数量计算超时时间（单位：毫秒）
function calculateTimeout(questionCount) {
    // 基础超时时间：10分钟
    const baseTimeout = 10 * 60 * 1000
    // 每个题目额外增加2分钟
    const timePerQuestion = 2 * 60 * 1000
    return baseTimeout + (questionCount * timePerQuestion)
}

// 获取API客户端实例
async function getApiClient(options = {}) {
    const apiKey = await db.getConfig('anythingllm_api_key')
    if (!apiKey) {
        throw new Error('AnythingLLM API Key not configured')
    }
    
    return axios.create({
        baseURL: ANYTHING_LLM_BASE_URL,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        },
        timeout: options.timeout || 600000  // 默认10分钟超时
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
        const { count } = req.body

        // 根据题目数量设置超时时间
        const timeout = calculateTimeout(count)
        console.log(`Set timeout to ${timeout}ms for generating ${count} questions`)
        
        const apiClient = await getApiClient({ timeout })
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

// 文件上传路由
app.post('/api/v1/document/upload', async (req, res) => {
    let tempFilePath = null;
    let utf8FilePath = null;
    
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.files.file;
        
        // 处理文件名编码
        let originalFileName = file.name;
        
        // 如果文件名是 Buffer，先转换为字符串
        if (Buffer.isBuffer(originalFileName)) {
            originalFileName = originalFileName.toString('utf8');
        }
        
        // 检测文件名的编码并转换
        const fileNameBuffer = Buffer.from(originalFileName, 'binary');
        const detectedNameEncoding = chardet.detect(fileNameBuffer);
        console.log('Detected filename encoding:', detectedNameEncoding);
        
        // 转换文件名为 UTF-8
        const decodedFileName = iconv.decode(fileNameBuffer, detectedNameEncoding || 'utf8');
        
        console.log('File name conversion:', {
            original: originalFileName,
            detected: detectedNameEncoding,
            decoded: decodedFileName
        });

        // 创建临时目录（如果不存在）
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // 生成安全的临时文件路径
        const timestamp = Date.now();
        tempFilePath = path.join(tempDir, `upload_${timestamp}_${decodedFileName}`);
        
        // 移动上传的文件到临时目录
        await file.mv(tempFilePath);
        console.log('File saved to temp location:', {
            originalName: decodedFileName,
            tempPath: tempFilePath
        });

        // 检测文件内容编码
        const detectedContentEncoding = chardet.detectFileSync(tempFilePath);
        console.log('Detected file content encoding:', detectedContentEncoding);

        // 读取文件内容并转换编码
        const fileContent = fs.readFileSync(tempFilePath);
        const convertedContent = iconv.decode(fileContent, detectedContentEncoding || 'utf8');

        // 创建新的临时文件（UTF-8编码）
        utf8FilePath = tempFilePath + '.utf8';
        fs.writeFileSync(utf8FilePath, convertedContent, 'utf8');

        // 准备发送到 AnythingLLM 的表单数据
        const formData = new FormData();
        
        // 确保文件名是正确的 UTF-8 编码
        const finalFileName = Buffer.from(decodedFileName, 'utf8').toString('utf8');
        
        formData.append('file', fs.createReadStream(utf8FilePath), {
            filename: finalFileName,
            contentType: file.mimetype
        });

        console.log('Forwarding file to AnythingLLM:', {
            filename: finalFileName,
            mimetype: file.mimetype
        });

        // 发送文件到 AnythingLLM
        const apiClient = await getApiClient();
        const response = await apiClient.post('/api/v1/document/upload', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('AnythingLLM upload response:', response.data);

        // 清理临时文件
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        if (utf8FilePath && fs.existsSync(utf8FilePath)) {
            fs.unlinkSync(utf8FilePath);
        }
        console.log('Temporary files cleaned up');

        res.json(response.data);
    } catch (error) {
        console.error('Error uploading file:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        // 清理临时文件
        try {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            if (utf8FilePath && fs.existsSync(utf8FilePath)) {
                fs.unlinkSync(utf8FilePath);
            }
        } catch (cleanupError) {
            console.error('Error cleaning up temp files:', cleanupError);
        }

        res.status(500).json({
            error: 'Failed to upload file',
            message: error.message,
            details: error.response?.data
        });
    }
});

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
        }, {
            timeout: 600000  // 10分钟超时
        })

        console.log('Chat response:', response.data)
        res.json(response.data)
    } catch (error) {
        console.error('Error in workspace chat:', {
            error: error.message,
            response: error.response?.data,
            config: error.config
        })
        
        // 处理特定类型的错误
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                error: '生成题目超时',
                message: '请稍后重试或减少文本内容'
            })
        }
        
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
