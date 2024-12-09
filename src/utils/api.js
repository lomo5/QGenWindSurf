import axios from 'axios';

const API_BASE_URL = 'http://localhost:3002';  // 使用代理服务器端口

// 创建带有拦截器的 axios 实例
const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
});

// 添加请求拦截器
axiosInstance.interceptors.request.use(
    config => {
        // 如果是 auth 相关的请求，添加 Authorization header
        if (config.url?.includes('/api/v1/auth')) {
            const apiKey = localStorage.getItem('apiKey')
            if (apiKey) {
                config.headers.Authorization = `Bearer ${apiKey}`
            }
        }
        console.log(`Making ${config.method.toUpperCase()} request to ${config.url}`, config.data)
        return config
    },
    error => {
        console.error('Request error:', error)
        return Promise.reject(error)
    }
)

// 添加响应拦截器
axiosInstance.interceptors.response.use(
    response => {
        console.log(`Response from ${response.config.url}:`, response.data)
        return response
    },
    error => {
        console.error('Response error:', {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        })
        return Promise.reject(error)
    }
)

const api = {
    // 检查服务是否可用并验证 API Key
    checkService: async () => {
        try {
            const apiKey = localStorage.getItem('apiKey')
            if (!apiKey) {
                return { serviceAvailable: true, apiKeyValid: false }
            }

            const response = await axiosInstance.get('/api/v1/auth')
            return {
                serviceAvailable: true,
                apiKeyValid: response.data.authenticated === true
            }
        } catch (error) {
            if (error.response) {
                // 服务可用，但 API Key 无效
                if (error.response.status === 403) {
                    return { serviceAvailable: true, apiKeyValid: false }
                }
            }
            // 服务不可用
            console.error('AnythingLLM 服务未运行或无法访问:', error)
            return { serviceAvailable: false, apiKeyValid: false }
        }
    },

    // 配置相关方法
    getConfig: async (key) => {
        try {
            const response = await axiosInstance.get(`/api/config/${key}`)
            return response.data
        } catch (error) {
            console.error('获取配置失败:', error)
            return null
        }
    },

    setConfig: async (key, value) => {
        try {
            const response = await axiosInstance.post(`/api/config/${key}`, { value })
            return response.data
        } catch (error) {
            console.error('设置配置失败:', error)
            throw error
        }
    },

    // 工作区相关方法
    getWorkspaces: async () => {
        try {
            const response = await axiosInstance.get('/workspaces')
            return response.data
        } catch (error) {
            console.error('获取工作区列表失败:', error)
            return [] // 返回空数组而不是抛出错误
        }
    },

    createWorkspace: async (name) => {
        try {
            console.log('Creating workspace:', { name })
            const response = await axiosInstance.post('/workspaces', { name })
            console.log('Workspace created:', response.data)
            return response.data
        } catch (error) {
            console.error('创建工作区失败:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            if (error.response?.status === 409 && error.response?.data?.workspace) {
                return error.response.data.workspace
            }
            throw error
        }
    },

    getWorkspace: async (slug) => {
        try {
            const response = await axiosInstance.get(`/api/v1/workspace/${slug}`)
            return response.data
        } catch (error) {
            console.error('Error getting workspace:', error)
            throw error
        }
    },

    getWorkspaceFiles: async (slug) => {
        try {
            console.log('Getting workspace files:', slug)
            const response = await axiosInstance.get(`/api/workspaces/${slug}/files`)
            console.log('Got workspace files:', response.data)
            return response.data.documents || []
        } catch (error) {
            console.error('获取工作区文件列表失败:', {
                slug,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            if (error.response?.status === 404) {
                return []
            }
            throw error
        }
    },

    uploadFile: async (file, workspace) => {
        try {
            console.log('Uploading file to AnythingLLM')
            const formData = new FormData()
            formData.append('file', file)

            // 1. 上传文件
            const uploadResponse = await axiosInstance.post('/api/v1/document/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            })

            console.log('File upload response:', uploadResponse.data)

            if (!uploadResponse.data.success || !uploadResponse.data.documents?.[0]) {
                throw new Error('Invalid response: missing document data')
            }

            // 2. 从上传响应中获取文档信息
            const uploadedDoc = uploadResponse.data.documents[0]
            const documentPath = uploadedDoc.location
                .split('\\')
                .pop() // 获取文件名部分
                .replace(/^.*[\\\/]/, '') // 移除任何剩余的路径分隔符
            
            console.log('Binding document to workspace:', { 
                workspace, 
                documentPath,
                originalLocation: uploadedDoc.location
            })

            // 3. 将文档绑定到工作区
            const updateResponse = await axiosInstance.post(`/api/v1/workspace/${workspace}/update-embeddings`, {
                adds: [documentPath],
                deletes: []
            })

            // 4. 获取更新后的工作区信息
            const workspaceInfo = await axiosInstance.get(`/api/v1/workspace/${workspace}`)
            console.log('Updated workspace information:', workspaceInfo.data)

            return {
                document: uploadedDoc,
                workspace: workspaceInfo.data
            }
        } catch (error) {
            console.error('Error uploading file:', error)
            throw error
        }
    },

    deleteWorkspaceFile: async (slug, fileId) => {
        try {
            console.log('Deleting file:', { slug, fileId })
            const response = await axiosInstance.delete(`/api/workspaces/${slug}/files/${fileId}`)
            console.log('File deleted:', response.data)
            return response.data
        } catch (error) {
            console.error('删除文件失败:', {
                slug,
                fileId,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            throw error
        }
    },

    generateQuestions: async (params) => {
        const { type, count, model, prompt } = params;
        
        try {
            console.log('Generating questions:', { type, count, model, prompt })
            const response = await axiosInstance.post('/api/generate-questions', {
                message: prompt || `根据上下文生成 ${count} 道${type}题，包括题目和答案`,
                model: model,
                temperature: 0.7,
                stream: false
            });
            console.log('Questions generated:', response.data)
            return response.data;
        } catch (error) {
            console.error('生成题目失败:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            throw error;
        }
    },

    getOriginalText: async (questionContext) => {
        try {
            console.log('Getting original text:', questionContext)
            const response = await axiosInstance.post('/api/get-original-text', {
                context: questionContext
            });
            console.log('Original text:', response.data)
            return response.data;
        } catch (error) {
            console.error('获取原文内容失败:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            throw error;
        }
    },

    getApiKey: () => {
        return localStorage.getItem('apiKey')
    },

    setApiKey: async (apiKey) => {
        try {
            localStorage.setItem('apiKey', apiKey)
            // 立即验证新设置的 API Key
            const response = await axiosInstance.get('/api/v1/auth')
            if (response.data.authenticated === true) {
                return true
            }
            localStorage.removeItem('apiKey')
            throw new Error('API Key 验证失败')
        } catch (error) {
            localStorage.removeItem('apiKey')
            console.error('设置 API Key 失败:', error)
            throw error
        }
    },

    // 专业相关
    getProfessions: async () => {
        try {
            console.log('Getting professions:')
            const response = await axiosInstance.get('/professions')
            console.log('Professions:', response.data)
            return response.data;
        } catch (error) {
            console.error('获取专业列表失败:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            throw error;
        }
    },

    addProfession: async (name) => {
        try {
            console.log('Adding profession:', name)
            const response = await axiosInstance.post('/professions', { name });
            console.log('Profession added:', response.data)
            return response.data;
        } catch (error) {
            console.error('添加专业失败:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            })
            throw error;
        }
    },

    // 获取所有已上传的文档
    getAllDocuments: async () => {
        try {
            const response = await axiosInstance.get('/api/v1/documents')
            // 从嵌套结构中提取文档列表
            const documents = response.data?.localFiles?.items?.[0]?.items || []
            return documents
        } catch (error) {
            console.error('Error fetching documents:', error)
            throw error
        }
    },

    // 获取工作区数据
    getWorkspaceData: async (workspaceSlug) => {
        try {
            const response = await axiosInstance.get(`/api/v1/workspace/${workspaceSlug}`)
            return response.data
        } catch (error) {
            console.error('Error fetching workspace data:', error)
            throw error
        }
    },

    // 将文档嵌入到工作区
    embedDocument: async (workspaceSlug, documentId) => {
        try {
            console.log(`Embedding document ${documentId} to workspace ${workspaceSlug}`)
            
            // 1. 获取文档信息
            const docsResponse = await axiosInstance.get('/api/v1/documents')
            const documents = docsResponse.data?.localFiles?.items?.[0]?.items || []
            const document = documents.find(doc => doc.id === documentId)
            
            if (!document) {
                throw new Error(`Document with ID ${documentId} not found`)
            }
            
            // 构建文档路径（custom-documents/文件名）
            const documentPath = `custom-documents/${document.name}`
            console.log('Document path for embedding:', documentPath)
            
            // 更新工作区的嵌入，使用正确的文档路径
            const response = await axiosInstance.post(`/api/v1/workspace/${workspaceSlug}/update-embeddings`, {
                adds: [documentPath],
                deletes: []
            })
            console.log('Embedding response:', response.data)
            
            return response.data
        } catch (error) {
            console.error('Error embedding document:', error.response?.data || error)
            throw error
        }
    },

    // 工作区聊天
    workspaceChat: async (workspaceSlug, message, mode = 'chat') => {
        try {
            const response = await axiosInstance.post(`/api/v1/workspace/${workspaceSlug}/chat`, {
                message,
                mode
            })
            return response.data
        } catch (error) {
            console.error('Error in workspace chat:', error.response?.data || error)
            throw error
        }
    },
};

export default api;
