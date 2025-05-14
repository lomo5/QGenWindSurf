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
                  <el-option label="Llama3.1:8b" value="llama3" />
                  <el-option label="Gemma2:9b" value="gemma2" />
                  <el-option label="Qwen2:7b" value="qwen2" />
                </el-select>
              </el-form-item>
              <el-form-item label="题目类型">
                <el-select v-model="questionType" style="width: 100%">
                  <el-option label="单选题" value="single" />
                  <el-option label="多选题" value="multiple" />
                  <el-option label="判断题" value="judgment" />
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
                    :type="isDocumentEmbedded(scope.row) ? 'warning' : 'primary'"
                    link
                    :loading="scope.row.loading"
                    @click="isDocumentEmbedded(scope.row) ? unembedDocument(scope.row) : embedDocument(scope.row)"
                  >
                    {{ isDocumentEmbedded(scope.row) ? '卸载' : '加载' }}
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
    <el-dialog
      v-model="workspaceDialogVisible"
      title="选择工作区"
      width="30%"
      @open="openWorkspaceDialog"
    >
      <el-form>
        <el-form-item label="工作区">
          <el-select
            v-model="selectedWorkspace"
            placeholder="请选择工作区"
            style="width: 100%"
          >
            <el-option
              v-for="workspace in workspaces"
              :key="workspace.id || workspace.slug"
              :label="workspace.name || workspace.slug || workspace.id"
              :value="workspace.slug || workspace.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="openCreateWorkspaceDialog">
            创建新工作区
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="workspaceDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmWorkspace">
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 创建工作区对话框 -->
    <el-dialog
      v-model="createWorkspaceDialogVisible"
      title="创建新工作区"
      width="30%"
    >
      <el-form>
        <el-form-item label="工作区名称" required>
          <el-input v-model="newWorkspaceName" placeholder="请输入工作区名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="createWorkspaceDialogVisible = false">取消</el-button>
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
import { utils as xlsxUtils, write as xlsxWrite } from 'xlsx'

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
const selectedModel = ref('Llama3.1:8b')
const questionType = ref('single')
const selectedProfession = ref(null)
const fileList = ref([])
const promptText = ref('')
const newProfessionName = ref('')
const newWorkspaceName = ref('')
const workspaces = ref([])
const selectedWorkspace = ref('')
const questions = ref([])
const questionCount = ref(10)
const uploadedFiles = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const embeddedDocs = ref(new Set())
const createWorkspaceDialogVisible = ref(false)

// 题型提示模板
const questionPrompts = {
  'single': {
    type: '单选题',
    description: '每个题目只有一个正确答案',
    format: `题目格式要求：
1. 题干要明确、清晰，避免模棱两可
2. 四个选项内容要简洁，具有明显区分度
3. 答案必须是 A、B、C、D 中的一个字母
4. 确保只有一个正确答案`,
  },
  'multiple': {
    type: '多选题',
    description: '每个题目可以有多个正确答案',
    format: `题目格式要求：
1. 题干要明确、清晰，避免模棱两可
2. 四个选项内容要简洁，具有明显区分度
3. 答案必须是 A、B、C、D 的组合，如 "ABC"
4. 至少有两个正确答案，最多四个`,
  },
  'judgment': {
    type: '判断题',
    description: '判断题只有对错两个选项',
    format: `题目格式要求：
1. 题干必须是一个明确的陈述句
2. 只能有两个选项：A表示正确，B表示错误
3. 答案必须是 A 或 B
4. 避免使用模棱两可的表述`,
  }
}

// 命令处理
const handleCommand = (command) => {
  if (command === 'apikey') {
    apikeyDialogVisible.value = true
  } else if (command === 'prompt') {
    promptDialogVisible.value = true
  } else if (command === 'workspace') {
    openWorkspaceDialog() // 调用新的方法
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
  if (!selectedWorkspace.value) {
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
    await api.uploadFile(file.raw, selectedWorkspace.value)
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
const setupWorkspace = async () => {
  try {
    // 加载工作区列表
    await loadWorkspaces()
    
    // 如果没有选择工作区，打开工作区选择对话框
    if (!selectedWorkspace.value) {
      workspaceDialogVisible.value = true
    }
  } catch (error) {
    console.error('Error setting up workspace:', error)
    ElMessage.error('工作区初始化失败')
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
  if (!selectedWorkspace.value) {
    ElMessage.error('工作区未初始化')
    return
  }

  try {
    await ElMessageBox.confirm('确定要删除该文件吗？', '提示', {
      type: 'warning'
    })
    
    await api.deleteWorkspaceFile(selectedWorkspace.value, file.id)
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
  if (!selectedWorkspace.value) {
    ElMessage.warning('请先选择工作区')
    return
  }

  file.loading = true
  try {
    console.log('Embedding file:', file)
    await api.embedDocument(selectedWorkspace.value, file.id)
    
    // 立即更新本地状态
    const docPath = `custom-documents/${file.name}`
    embeddedDocs.value.add(docPath)
    
    // 重新加载工作区数据以确保状态同步
    await loadWorkspaceData()
    ElMessage.success('文档加载成功')
  } catch (error) {
    console.error('Error embedding document:', error)
    ElMessage.error('文档加载失败: ' + error.message)
  } finally {
    file.loading = false
  }
}

const loadWorkspaceData = async () => {
  if (!selectedWorkspace.value) return
  
  try {
    const workspace = await api.getWorkspaceData(selectedWorkspace.value)
    console.log('Workspace data:', workspace)
    
    // 更新已嵌入文档集合
    if (workspace.documents) {
      embeddedDocs.value.clear()
      workspace.documents.forEach(doc => {
        const docPath = doc.docpath || doc.path || `custom-documents/${doc.name}`
        if (docPath) {
          embeddedDocs.value.add(docPath)
        }
      })
      console.log('Updated embedded docs:', Array.from(embeddedDocs.value))
    }
  } catch (error) {
    console.error('Error loading workspace data:', error)
    throw error // 向上传播错误，让调用者处理
  }
}

const unembedDocument = async (file) => {
  if (!selectedWorkspace.value) {
    ElMessage.error('请先选择工作区')
    return
  }

  file.loading = true
  try {
    const docPath = `custom-documents/${file.name}`
    await api.unembedDocument(selectedWorkspace.value, docPath)
    
    // 立即更新本地状态
    embeddedDocs.value.delete(docPath)
    
    // 重新加载工作区数据以确保状态同步
    await loadWorkspaceData()
    ElMessage.success('文档卸载成功')
  } catch (error) {
    console.error('Error unembedding document:', error)
    ElMessage.error('文档卸载失败: ' + error.message)
  } finally {
    file.loading = false
  }
}

const isDocumentEmbedded = (doc) => {
  // 检查多种可能的文档路径格式
  const possiblePaths = [
    `custom-documents/${doc.name}`,
    doc.name,
    doc.path,
    doc.docpath
  ].filter(Boolean)

  // 检查文档是否已加载
  const isEmbedded = possiblePaths.some(path => embeddedDocs.value.has(path))
  console.log('Document embedded status:', {
    doc: doc.name,
    paths: possiblePaths,
    embedded: isEmbedded,
    allEmbedded: Array.from(embeddedDocs.value)
  })
  return isEmbedded
}

// 导出题库
const exportQuestions = () => {
  if (!questions.value || questions.value.length === 0) {
    ElMessage.warning('没有可导出的题目')
    return
  }

  try {
    // 准备Excel数据
    const excelData = questions.value.map((q, index) => {
      const baseData = {
        '序号': index + 1,
        '题目类型': q.type,
        '题目': q.question,
        '正确答案': q.answer
      }

      // 根据题型添加不同的选项
      if (q.type === '判断题') {
        return {
          ...baseData,
          '选项A': '正确',
          '选项B': '错误'
        }
      } else {
        return {
          ...baseData,
          '选项A': q.options[0],
          '选项B': q.options[1],
          '选项C': q.options[2],
          '选项D': q.options[3]
        }
      }
    })

    // 创建工作簿和工作表
    const ws = xlsxUtils.json_to_sheet(excelData)
    const wb = xlsxUtils.book_new()
    xlsxUtils.book_append_sheet(wb, ws, '题库')

    // 设置列宽
    const colWidths = {
      '序号': 6,
      '题目类型': 10,
      '题目': 50,
      '选项A': 30,
      '选项B': 30,
      '选项C': 30,
      '选项D': 30,
      '正确答案': 15
    }

    ws['!cols'] = Object.values(colWidths).map(width => ({ wch: width }))

    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `题库_${timestamp}.xlsx`

    // 导出文件
    const wbout = xlsxWrite(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/octet-stream' })
    
    // 创建下载链接并触发下载
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    
    // 清理
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    ElMessage.success('题库导出成功')
  } catch (error) {
    console.error('导出题库失败:', error)
    ElMessage.error('导出题库失败，请重试')
  }
}

const generateQuestions = async () => {
  if (!selectedWorkspace.value) {
    ElMessage.error('请先选择工作区')
    return
  }

  if (!selectedProfession.value) {
    ElMessage.warning('请先选择专业')
    return
  }

  try {
    generatingQuestions.value = true
    ElMessage.info('正在生成题目...')
    
    // 获取当前题型的提示模板
    const promptTemplate = questionPrompts[questionType.value]
    if (!promptTemplate) {
      throw new Error('未知的题目类型')
    }

    // 构建提示语
    const prompt = `请根据文档内容生成${questionCount.value}道${promptTemplate.type}。

基本要求：
1. 题目内容必须来自已上传的文档
2. 题目难度要适中，避免过于简单或过于复杂
3. 题目内容要准确，不能有歧义
4. 必须直接返回JSON数组，不要包含任何其他文字说明

${promptTemplate.format}

返回格式要求：
- 必须是一个有效的 JSON 数组
- 不要包含任何额外的解释或说明文字
- 每个题目对象包含以下字段：
  - type: 题目类型（${promptTemplate.type}）
  - question: 题干
  - options: 选项数组${questionType.value === 'judgment' ? '，固定为["正确", "错误"]' : '，包含4个选项'}
  - answer: 正确答案${questionType.value === 'multiple' ? '（多个字母组合，如"ABC"）' : '（单个字母A/B/C/D）'}

示例格式：
[{
  "type": "${promptTemplate.type}",
  "question": "题干内容",
  ${questionType.value === 'judgment' 
    ? '"options": ["正确", "错误"],'
    : '"options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],'
  }
  "answer": "${questionType.value === 'multiple' ? 'ABC' : 'A'}"
}]`

    console.log('Generating questions with prompt:', prompt)

    const response = await api.workspaceChat(
      selectedWorkspace.value,
      prompt,
      'chat'
    )

    console.log('Generated response:', response)

    // 解析返回的JSON字符串
    let generatedQuestions = []
    try {
      let jsonText = ''
      if (response.textResponse) {
        // 尝试从返回文本中提取 JSON 数组
        const matches = response.textResponse.match(/\[[\s\S]*\]/g)
        if (matches && matches.length > 0) {
          jsonText = matches[0]
        } else {
          throw new Error('返回内容中未找到有效的 JSON 数组')
        }
      } else if (response.text) {
        const matches = response.text.match(/\[[\s\S]*\]/g)
        if (matches && matches.length > 0) {
          jsonText = matches[0]
        } else {
          throw new Error('返回内容中未找到有效的 JSON 数组')
        }
      } else {
        throw new Error('未找到有效的返回数据')
      }

      // 尝试解析提取出的 JSON
      try {
        generatedQuestions = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('JSON 解析错误:', parseError)
        throw new Error('题目格式不正确，请重新生成')
      }

      // 验证生成的题目格式
      generatedQuestions.forEach((q, index) => {
        // 检查必要字段
        if (!q.type || !q.question || !q.options || !q.answer) {
          throw new Error(`第${index + 1}题格式不完整`)
        }

        // 判断题特殊处理
        if (questionType.value === 'judgment') {
          if (!Array.isArray(q.options) || q.options.length !== 2) {
            q.options = ['正确', '错误']
          }
          if (!/^[AB]$/.test(q.answer)) {
            throw new Error(`第${index + 1}题答案格式不正确`)
          }
        }
        // 多选题答案格式验证
        else if (questionType.value === 'multiple') {
          if (!/^[A-D]+$/.test(q.answer) || q.answer.length < 2 || q.answer.length > 4) {
            throw new Error(`第${index + 1}题答案格式不正确`)
          }
        }
        // 单选题答案格式验证
        else {
          if (!/^[A-D]$/.test(q.answer)) {
            throw new Error(`第${index + 1}题答案格式不正确`)
          }
        }
      })

      questions.value = generatedQuestions
      ElMessage.success('题目生成成功')
    } catch (error) {
      console.error('解析生成的题目时出错:', error)
      throw new Error('生成的题目格式不正确: ' + error.message)
    }
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
      selectedWorkspace.value = workspace.slug
      ElMessage.success('工作区创建成功')
      createWorkspaceDialogVisible.value = false
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

    // 加载已上传的文件列表
    await loadUploadedFiles()
    // 加载专业列表
    await loadProfessions()
    // 加载工作区列表
    await setupWorkspace()
  } catch (error) {
    console.error('系统初始化失败:', error)
    ElMessage.error('系统初始化失败')
  } finally {
    loading.value = false
  }
})

// 加载工作区列表
const loadWorkspaces = async () => {
  try {
    console.log('开始加载工作区列表...')
    const response = await api.getWorkspaces()
    console.log('工作区列表原始数据:', response)
    
    // 确保返回的数据是数组格式
    if (response && Array.isArray(response)) {
      workspaces.value = response
    } else if (response && typeof response === 'object') {
      // 如果返回的是对象，尝试提取数组
      const workspaceArray = response.workspaces || response.data || []
      workspaces.value = Array.isArray(workspaceArray) ? workspaceArray : []
    } else {
      workspaces.value = []
    }
    
    console.log('处理后的工作区列表:', workspaces.value)
  } catch (error) {
    console.error('加载工作区列表失败:', error)
    ElMessage.error('加载工作区列表失败')
    workspaces.value = []
  }
}

// 确认工作区选择
const confirmWorkspace = async () => {
  if (!selectedWorkspace.value) {
    ElMessage.warning('请选择一个工作区')
    return
  }
  
  try {
    loading.value = true
    workspaceDialogVisible.value = false
    await loadWorkspaceData()
    ElMessage.success('工作区加载成功')
  } catch (error) {
    console.error('Error loading workspace:', error)
    ElMessage.error('工作区加载失败')
    // 如果加载失败，重新打开工作区选择对话框
    workspaceDialogVisible.value = true
  } finally {
    loading.value = false
  }
}

// 打开工作区对话框
const openWorkspaceDialog = async () => {
  try {
    await loadWorkspaces() // 重新加载工作区列表
    workspaceDialogVisible.value = true
  } catch (error) {
    console.error('Error opening workspace dialog:', error)
    ElMessage.error('打开工作区对话框失败')
  }
}

// 打开创建工作区对话框
const openCreateWorkspaceDialog = () => {
  // 关闭工作区选择对话框
  workspaceDialogVisible.value = false
  // 清空新工作区的输入
  newWorkspaceName.value = ''
  // 打开创建工作区对话框
  createWorkspaceDialogVisible.value = true
}
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
