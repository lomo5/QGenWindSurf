const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            enableRemoteModule: true,
            preload: path.join(__dirname, 'src/preload.js')
        }
    });

    // Enable remote module
    require('@electron/remote/main').initialize();
    require('@electron/remote/main').enable(win.webContents);

    if (process.env.NODE_ENV === 'development') {
        // 等待一段时间让开发服务器启动
        setTimeout(() => {
            win.loadURL('http://localhost:5173');
            win.webContents.openDevTools();
        }, 2000);
    } else {
        win.loadFile('dist/index.html');
    }

    return win;
}

app.whenReady().then(() => {
    const mainWindow = createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 处理文件选择
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
    })
    return result
})

// 处理文件保存
ipcMain.handle('save-csv', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog({
        defaultPath: defaultPath,
        filters: [
            { name: 'CSV Files', extensions: ['csv'] }
        ]
    });
    return result.filePath;
});

// 处理窗口关闭
ipcMain.on('close-window', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
        win.close()
    }
})
