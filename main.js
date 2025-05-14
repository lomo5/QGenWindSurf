const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'
require('@electron/remote/main').initialize()

// 保持对window对象的全局引用，避免JavaScript对象被垃圾回收时，窗口被自动关闭
let mainWindow
let serverProcess

function createWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    })

    // 加载应用
    if (isDev) {
        // 开发环境：等待一段时间让开发服务器启动
        setTimeout(() => {
            mainWindow.loadURL('http://localhost:5173')
            mainWindow.webContents.openDevTools()
        }, 2000)
    } else {
        // 生产环境：加载打包后的文件
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
    }

    // 当window被关闭时，触发下面的事件
    mainWindow.on('closed', function () {
        mainWindow = null
    })
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
    createWindow()
    startServer()
})

// 所有窗口关闭时退出应用
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        if (serverProcess) {
            serverProcess.kill()
        }
        app.quit()
    }
})

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow()
    }
})

// 启动后端服务器
function startServer() {
    const { spawn } = require('child_process')
    const serverPath = isDev ? 'server.js' : path.join(process.resourcesPath, 'app.asar', 'server.js')
    
    serverProcess = spawn('node', [serverPath], {
        stdio: 'inherit',
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        }
    })

    serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err)
    })
}

// 处理文件选择
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile']
    })
    return result
})

// 处理文件保存
ipcMain.handle('save-csv', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog({
        defaultPath,
        filters: [
            { name: 'CSV Files', extensions: ['csv'] }
        ]
    })
    return result
})

// 处理窗口关闭
ipcMain.on('close-window', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
        win.close()
    }
})

// 清理资源
app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill()
    }
})
