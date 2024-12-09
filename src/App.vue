<template>
  <el-container class="app-container">
    <el-header>
      <div class="header-content">
        <h2>AI智能题库开发工具</h2>
        <div class="header-actions">
          <el-dropdown @command="handleCommand">
            <el-button>
              设置<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="apikey">API Key设置</el-dropdown-item>
                <el-dropdown-item command="prompt">Prompt设置</el-dropdown-item>
                <el-dropdown-item command="model">模型选择</el-dropdown-item>
                <el-dropdown-item command="workspace">工作区选择</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="danger" @click="handleExit" class="ml-2">退出</el-button>
        </div>
      </div>
    </el-header>

    <el-main>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>专业管理</span>
                <el-button type="primary" @click="showAddProfessionDialog">添加专业</el-button>
              </div>
            </template>
            <el-select v-model="selectedProfession" placeholder="选择专业" style="width: 100%">
              <el-option
                v-for="item in professions"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
          </el-card>

          <el-card class="box-card mt-4">
            <template #header>
              <div class="card-header">
                <span>文件上传</span>
              </div>
            </template>
            <el-upload
              class="upload-demo"
              drag
              action="#"
              :auto-upload="false"
              :on-change="handleFileChange"
              :on-remove="() => fileList = []"
              :file-list="fileList"
              :disabled="loading"
            >
              <el-icon class="el-icon--upload"><upload-filled /></el-icon>
              <div class="el-upload__text">
                将文件拖到此处或 <em>点击上传</em>
              </div>
            </el-upload>
            <div class="upload-actions">
              <el-button 
                type="success" 
                @click="handleUpload"
                :disabled="fileList.length === 0"
              >
                上传到RAG
              </el-button>
            </div>
          </el-card>

          <el-card class="box-card mt-4">
            <template #header>
              <div class="card-header">
                <span>生成配置</span>
              </div>
            </template>
            <el-form label-position="top">
              <el-form-item label="AI模型">
                <el-select v-model="selectedModel" style="width: 100%">
                  <el-option label="Llama2" value="llama2" />
                  <el-option label="Qwen" value="qwen" />
                  <el-option label="ChatGLM3" value="chatglm3" />
                </el-select>
              </el-form-item>
              <el-form-item label="题目类型">
                <el-select v-model="questionType" style="width: 100%">
                  <el-option label="单选题" value="single" />
                  <el-option label="多选题" value="multiple" />
                  <el-option label="判断题" value="judge" />
                </el-select>
              </el-form-item>
              <el-form-item label="生成数量">
                <el-input-number v-model="questionCount" :min="1" :max="20" style="width: 100%" />
              </el-form-item>
              <el-button 
                type="primary" 
                @click="generateQuestions" 
                style="width: 100%"
                :disabled="!selectedProfession || !selectedWorkspace"
              >
                生成题库
              </el-button>
            </el-form>
          </el-card>
        </el-col>

        <el-col :span="12">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>题目列表</span>
                <div>
                  <el-button type="success" @click="exportQuestions">导出题库</el-button>
                </div>
              </div>
            </template>
            <el-table :data="currentPageQuestions" style="width: 100%" v-loading="generatingQuestions">
              <el-table-column prop="type" label="题目类型" width="100" />
              <el-table-column prop="question" label="题干" min-width="300" />
              <el-table-column prop="options" label="备选答案" min-width="200">
                <template #default="{ row }">
                  <div v-for="(option, index) in row.options" :key="index">
                    {{ String.fromCharCode(65 + index) }}. {{ option }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="answer" label="答案" width="100" />
            </el-table>
            <div class="pagination">
              <el-pagination
                v-model:current-page="currentPage"
                :page-size="pageSize"
                :total="questions.length"
                layout="prev, pager, next"
                @current-change="handlePageChange"
              />
            </div>
          </el-card>
        </el-col>

        <el-col :span="6">
          <el-card class="box-card">
            <template #header>
              <div class="card-header">
                <span>已上传文件</span>
              </div>
            </template>
            <el-table :data="uploadedFiles" style="width: 100%" v-loading="loading">
              <el-table-column prop="displayName" label="文件名" min-width="200">
                <template #default="{ row }">
                  {{ row.displayName }}
                </template>
              </el-table-column>
              <el-table-column prop="size" label="大小" width="100" align="right">
                <template #default="{ row }">
                  {{ row.size }}
                </template>
              </el-table-column>
              <el-table-column prop="date" label="上传时间" width="150" align="center">
                <template #default="{ row }">
                  {{ row.date }}
                </template>
              </el-table-column>
              <el-table-column fixed="right" label="操作" width="100" align="center">
                <template #default="scope">
                  <el-button
                    type="primary"
                    link
                    :loading="scope.row.loading"
                    @click="embedDocument(scope.row)"
                  >
                    加载
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </el-main>

    <!-- 添加专业对话框 -->
    <el-dialog
      v-model="addProfessionDialogVisible"
      title="添加专业"
      width="30%"
    >
      <el-form>
        <el-form-item label="专业名称">
          <el-input v-model="newProfessionName" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addProfessionDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="addNewProfession">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- API Key设置对话框 -->
    <el-dialog
      v-model="apikeyDialogVisible"
      title="设置API Key"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-input
        v-model="apikey"
        placeholder="请输入AnythingLLM API Key"
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="saveApiKey">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Prompt设置对话框 -->
    <el-dialog v-model="promptDialogVisible" title="Prompt设置" width="50%">
      <el-form>
        <el-form-item label="Prompt模板">
          <el-input
            v-model="promptText"
            type="textarea"
            :rows="5"
            placeholder="请输入题目生成的Prompt模板"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="promptDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="savePrompt">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 工作区选择对话框 -->
    <el-dialog v-model="workspaceDialogVisible" title="工作区选择" width="30%">
      <el-select v-model="selectedWorkspace" placeholder="选择工作区" style="width: 100%">
        <el-option
          v-for="ws in workspaces"
          :key="ws.slug"
          :label="ws.name"
          :value="ws.slug"
        />
      </el-select>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="workspaceDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="createWorkspace">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 创建工作区对话框 -->
    <el-dialog v-model="showWorkspaceDialog" title="创建新工作区" width="30%">
      <el-form>
        <el-form-item label="工作区名称">
          <el-input v-model="newWorkspaceName" placeholder="例如：高中数学" />
        </el-form-item>
        <el-form-item label="工作区标识">
          <el-input v-model="newWorkspaceSlug" placeholder="例如：math-hs" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showWorkspaceDialog = false">取消</el-button>
          <el-button type="primary" @click="createWorkspace">
            创建
          </el-button>
        </span>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, UploadFilled } from '@element-plus/icons-vue'
import api from './utils/api'

// 状态变量
const apikeyDialogVisible = ref(false)
const promptDialogVisible = ref(false)
const addProfessionDialogVisible = ref(false)
const apikey = ref('')
const professions = ref([])
const newProfession = ref('')
const workspaceDialogVisible = ref(false)
const uploadDialogVisible = ref(false)
const workspaceFiles = ref([])
const loading = ref(false)
const isLoading = ref(false)
const generatingQuestions = ref(false)
const currentWorkspace = ref(null)
const selectedModel = ref('gpt-3.5-turbo')
const questionType = ref('single')
const showWorkspaceDialog = ref(false)
const selectedProfession = ref(null)
const fileList = ref([])
const promptText = ref('')
const newProfessionName = ref('')
const newWorkspaceName = ref('')
const newWorkspaceSlug = ref('')
const workspaces = ref([])
const selectedWorkspace = ref(null)
const questions = ref([])
const questionCount = ref(10)
const uploadedFiles = ref([])
const currentPage = ref(1)
const pageSize = ref(10)

// 选项数据
const modelOptions = [
  { label: 'GPT-3.5', value: 'gpt-3.5-turbo' },
  { label: 'GPT-4', value: 'gpt-4' }
]

const questionTypeOptions = [
  { label: '单选题', value: 'single' },
  { label: '多选题', value: 'multiple' },
  { label: '判断题', value: 'judge' },
  { label: '填空题', value: 'blank' },
  { label: '简答题', value: 'short' }
]

// 命令处理
const handleCommand = (command) => {
  if (command === 'apikey') {
    apikeyDialogVisible.value = true
  } else if (command === 'prompt') {
    promptDialogVisible.value = true
  } else if (command === 'workspace') {
    workspaceDialogVisible.value = true
  }
}

const handleExit = () => {
  window.close()
}

// 专业相关
const showAddProfessionDialog = () => {
  newProfessionName.value = ''
  addProfessionDialogVisible.value = true
}

const addNewProfession = async () => {
  if (!newProfessionName.value) {
    ElMessage.warning('请输入专业名称')
    return
  }

  try {
    await api.addProfession(newProfessionName.value)
    ElMessage.success('添加专业成功')
    addProfessionDialogVisible.value = false
    await loadProfessions()
  } catch (error) {
    console.error('添加专业失败:', error)
    ElMessage.error('添加专业失败')
  }
}

// 文件上传相关
const handleUpload = async () => {
  if (!currentWorkspace.value) {
    ElMessage.warning('请等待工作区初始化完成')
    return
  }

  if (fileList.value.length === 0) {
    ElMessage.warning('请选择要上传的文件')
    return
  }

  const file = fileList.value[0]
  
  try {
    loading.value = true
    ElMessage.info('正在上传文件...')
    await api.uploadFile(file.raw, currentWorkspace.value.slug)
    ElMessage.success('文件上传成功')
    fileList.value = []
    await loadUploadedFiles()
  } catch (error) {
    console.error('文件上传失败:', error)
    ElMessage.error('文件上传失败')
  } finally {
    loading.value = false
  }
}

const handleFileChange = (uploadFile) => {
  fileList.value = [uploadFile]
}

// 加载数据
const loadProfessions = async () => {
  try {
    const result = await api.getProfessions()
    professions.value = result
  } catch (error) {
    console.error('加载专业列表失败:', error)
    ElMessage.error('加载专业列表失败')
  }
}

// API Key 相关
const checkAndSetupApiKey = async () => {
  try {
    const key = await api.getConfig('apiKey')
    if (!key) {
      apikeyDialogVisible.value = true
    }
  } catch (error) {
    console.error('检查 API Key 失败:', error)
    ElMessage.error('检查 API Key 失败')
  }
}

const saveApiKey = async () => {
  if (!apikey.value) {
    ElMessage.error('请输入 API Key')
    return
  }

  try {
    await api.setApiKey(apikey.value)
    apikeyDialogVisible.value = false
    ElMessage.success('API Key 设置成功')
    // 重新检查系统状态
    checkSystemStatus()
  } catch (error) {
    console.error('设置 API Key 失败:', error)
    ElMessage.error(error.message || 'API Key 设置失败')
  }
}

// 工作区相关
const generateWorkspaceName = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `workspace-${year}${month}${day}`
}

const setupWorkspace = async () => {
  loading.value = true
  try {
    // 获取工作区列表
    const workspaces = await api.getWorkspaces()
    
    if (workspaces && workspaces.length > 0) {
      // 使用第一个工作区
      currentWorkspace.value = workspaces[0]
      console.log('Using existing workspace:', currentWorkspace.value)
      return
    }

    // 如果没有工作区，创建新工作区
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        const name = generateWorkspaceName()
        console.log(`Creating new workspace (attempt ${retryCount + 1}):`, { name })
        const workspace = await api.createWorkspace(name)
        if (workspace) {
          currentWorkspace.value = workspace
          console.log('New workspace created:', workspace)
          return
        }
      } catch (error) {
        retryCount++
        if (retryCount === maxRetries || error.response?.status !== 409) {
          throw error
        }
        console.log(`Workspace creation failed (attempt ${retryCount}), retrying...`)
        await new Promise(resolve => setTimeout(resolve, 1000)) // 等待一秒后重试
      }
    }
  } catch (error) {
    console.error('Workspace setup failed:', error)
    ElMessage.error('工作区设置失败：' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
  }
}

const loadUploadedFiles = async () => {
  try {
    isLoading.value = true
    const response = await api.getAllDocuments()
    uploadedFiles.value = response.map(doc => ({
      ...doc,
      displayName: doc.title || doc.name || '未命名文件',
      size: doc.wordCount ? `${doc.wordCount} 字` : '未知',
      date: doc.published || '未知'
    }))
  } catch (error) {
    console.error('Error loading files:', error)
    ElMessage.error('加载文件列表失败')
    uploadedFiles.value = []
  } finally {
    isLoading.value = false
  }
}

const deleteFile = async (file) => {
  if (!currentWorkspace.value?.slug) {
    ElMessage.error('工作区未初始化')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除该文件吗？', '提示', {
      type: 'warning'
    })
    
    await api.deleteWorkspaceFile(currentWorkspace.value.slug, file.id)
    ElMessage.success('文件删除成功')
    await loadUploadedFiles()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除文件失败:', error)
      ElMessage.error('删除文件失败')
    }
  }
}

const embedDocument = async (file) => {
  if (!currentWorkspace.value?.slug) {
    ElMessage.error('请先选择工作区')
    return
  }

  try {
    loading.value = true
    console.log('Embedding file:', file)
    
    // 确保文件已上传
    if (!file.id) {
      throw new Error('文件ID不存在')
    }

    await api.embedDocument(currentWorkspace.value.slug, file.id)
    ElMessage.success('文档嵌入成功')
    
    // 刷新工作区数据
    await loadWorkspaceData()
    // 刷新文件列表
    await loadUploadedFiles()
  } catch (error) {
    console.error('Failed to embed document:', error)
    ElMessage.error(
      error.response?.data?.message || 
      error.message || 
      '文档嵌入失败，请检查控制台获取详细信息'
    )
  } finally {
    loading.value = false
  }
}

const loadWorkspaceData = async () => {
  if (!currentWorkspace.value?.slug) return
  
  try {
    const response = await api.getWorkspaceData(currentWorkspace.value.slug)
    console.log('Workspace data:', response)
    // 更新工作区信息
    if (response?.workspace) {
      currentWorkspace.value = {
        ...currentWorkspace.value,
        ...response.workspace
      }
    }
  } catch (error) {
    console.error('Failed to load workspace data:', error)
  }
}

const exportQuestions = () => {
  console.log('Exporting questions...')
  // TODO: 实现导出逻辑
}

const generateQuestions = async () => {
  if (!currentWorkspace.value?.slug) {
    ElMessage.error('请先选择工作区')
    return
  }

  try {
    generatingQuestions.value = true
    
    // 构建提示语
    const prompt = `请根据文档内容生成${questionCount.value}道${getQuestionTypeLabel(questionType.value)}。
要求如下：
1. 题目内容必须来自已上传的文档
2. 每道题目必须包含：题干、4个选项（A、B、C、D）和正确答案
3. 选项内容要简洁明了，具有区分度
4. 答案必须是 A、B、C、D 中的一个字母

返回格式要求：
JSON数组，每个题目对象包含以下字段：
- type: 题目类型（单选题/多选题/判断题）
- question: 题干
- options: 选项数组，包含4个选项
- answer: 正确答案（A/B/C/D）

示例：[{
  "type": "单选题",
  "question": "题干内容",
  "options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],
  "answer": "A"
}]`

    const response = await api.workspaceChat(
      currentWorkspace.value.slug,
      prompt,
      'chat'
    )

    // 解析返回的JSON字符串
    let generatedQuestions = []
    try {
      // 查找返回文本中的JSON数组
      const match = response.content.match(/\[.*\]/s)
      if (match) {
        generatedQuestions = JSON.parse(match[0])
      } else {
        throw new Error('返回格式不正确')
      }
    } catch (parseError) {
      console.error('解析题目失败:', parseError)
      ElMessage.error('生成的题目格式不正确，请重试')
      return
    }

    // 验证题目格式
    const validQuestions = generatedQuestions.filter(q => {
      return q.type && q.question && 
             Array.isArray(q.options) && q.options.length === 4 &&
             q.answer && /^[A-D]$/.test(q.answer)
    })

    if (validQuestions.length === 0) {
      throw new Error('没有生成有效的题目')
    }

    // 更新题目列表
    questions.value = validQuestions
    currentPage.value = 1
    
    ElMessage.success(`成功生成 ${validQuestions.length} 道题目`)
  } catch (error) {
    console.error('生成题目失败:', error)
    ElMessage.error(error.message || '生成题目失败，请重试')
  } finally {
    generatingQuestions.value = false
  }
}

const getQuestionTypeLabel = (value) => {
  const option = questionTypeOptions.find(opt => opt.value === value)
  return option ? option.label : ''
}

const currentPageQuestions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return questions.value.slice(start, end)
})

const handlePageChange = (page) => {
  currentPage.value = page
}

// 检查系统状态
const checkSystemStatus = async () => {
  try {
    // 检查 AnythingLLM 服务和 API Key
    const { serviceAvailable, apiKeyValid } = await api.checkService()
    
    if (!serviceAvailable) {
      ElMessageBox.alert(
        '请确保 AnythingLLM 服务正在运行（http://localhost:3001）',
        '服务未启动',
        {
          type: 'error',
          showClose: false,
          confirmButtonText: '重试',
          callback: () => {
            checkSystemStatus()
          }
        }
      )
      return false
    }

    if (!apiKeyValid) {
      ElMessageBox.alert(
        '请配置有效的 AnythingLLM API Key',
        'API Key 无效',
        {
          type: 'warning',
          showClose: false,
          confirmButtonText: '去设置',
          callback: () => {
            apikeyDialogVisible.value = true
          }
        }
      )
      return false
    }

    return true
  } catch (error) {
    console.error('系统状态检查失败:', error)
    ElMessage.error('系统状态检查失败')
    return false
  }
}

// 工作区相关方法
const createWorkspace = async () => {
  if (!newWorkspaceName.value) {
    ElMessage.error('请输入工作区名称')
    return
  }

  try {
    loading.value = true
    const workspace = await api.createWorkspace(newWorkspaceName.value)
    if (workspace) {
      currentWorkspace.value = workspace
      ElMessage.success('工作区创建成功')
      workspaceDialogVisible.value = false
      showWorkspaceDialog.value = false
      // 重新加载工作区数据
      await loadWorkspaceData()
    }
  } catch (error) {
    console.error('创建工作区失败:', error)
    ElMessage.error('创建工作区失败：' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
  }
}

// 生命周期钩子
onMounted(async () => {
  try {
    loading.value = true
    
    // 首先检查系统状态
    const systemOk = await checkSystemStatus()
    if (!systemOk) {
      return
    }

    // 初始化其他组件
    await Promise.all([
      setupWorkspace(),
      loadProfessions()
    ])
    
    await loadUploadedFiles()
  } catch (error) {
    console.error('系统初始化失败:', error)
    ElMessage.error('系统初始化失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.app-container {
  height: 100vh;
}

.el-header {
  background-color: white;
  border-bottom: 1px solid #e4e7ed;
}

.box-card {
  margin-bottom: 1rem;
}

.mt-4 {
  margin-top: 1rem;
}

.w-full {
  width: 100%;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.space-x-4 > * + * {
  margin-left: 1rem;
}

.mr-2 {
  margin-right: 0.5rem;
}

.ml-2 {
  margin-left: 0.5rem;
}

.text-xl {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

.font-bold {
  font-weight: 700;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ml-2 {
  margin-left: 0.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mt-4 {
  margin-top: 1rem;
}

.ml-3 {
  margin-left: 0.75rem;
}

.upload-demo {
  width: 100%;
}

.upload-actions {
  margin-top: 20px;
  text-align: center;
}

.statistics {
  padding: 10px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
}

.stat-item.total {
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid #eee;
  font-weight: bold;
}

.stat-label {
  color: #606266;
}

.stat-value {
  font-weight: 500;
  color: #409EFF;
}

.uploaded-files {
  max-height: 300px;
  overflow-y: auto;
}

.el-table {
  margin-top: 10px;
}

.pagination {
  margin-top: 10px;
  text-align: center;
}
</style>
