const sqlite3 = require('sqlite3').verbose()
const { app } = require('@electron/remote')
const path = require('path')
const fs = require('fs')

// 确保数据库目录存在
const dbDir = path.join(app.getPath('userData'), '.qgen-windsurf')
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
}

const dbPath = path.join(dbDir, 'database.db')
const db = new sqlite3.Database(dbPath)

// 初始化数据库表
db.serialize(() => {
    // 配置表
    db.run(`CREATE TABLE IF NOT EXISTS configs (
        key TEXT PRIMARY KEY,
        value TEXT
    )`)

    // 专业表
    db.run(`CREATE TABLE IF NOT EXISTS professions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`)

    // 题目表
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profession_id INTEGER,
        type TEXT NOT NULL,
        stem TEXT NOT NULL,
        options TEXT,
        answer TEXT NOT NULL,
        source_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profession_id) REFERENCES professions(id)
    )`)
})

// 数据库操作方法
const dbOperations = {
    // 配置相关方法
    async getConfig(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT value FROM configs WHERE key = ?', [key], (err, row) => {
                if (err) reject(err)
                else resolve(row ? row.value : null)
            })
        })
    },

    async setConfig(key, value) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)',
                [key, value],
                (err) => {
                    if (err) reject(err)
                    else resolve()
                }
            )
        })
    },

    // 专业相关方法
    async addProfession(name) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO professions (name) VALUES (?)',
                [name],
                function (err) {
                    if (err) reject(err)
                    else resolve(this.lastID)
                }
            )
        })
    },

    async getProfessions() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM professions ORDER BY name', (err, rows) => {
                if (err) reject(err)
                else resolve(rows)
            })
        })
    },

    // 题目相关方法
    async saveQuestion(question) {
        return new Promise((resolve, reject) => {
            const { profession_id, type, stem, options, answer, source_text } = question
            db.run(
                `INSERT INTO questions 
                (profession_id, type, stem, options, answer, source_text)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [profession_id, type, stem, JSON.stringify(options), answer, source_text],
                function (err) {
                    if (err) reject(err)
                    else resolve(this.lastID)
                }
            )
        })
    },

    async getQuestions(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM questions'
            const params = []
            const conditions = []

            if (filters.profession_id) {
                conditions.push('profession_id = ?')
                params.push(filters.profession_id)
            }

            if (filters.type) {
                conditions.push('type = ?')
                params.push(filters.type)
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ')
            }

            query += ' ORDER BY created_at DESC'

            db.all(query, params, (err, rows) => {
                if (err) reject(err)
                else {
                    // 解析 options 字段
                    const questions = rows.map(row => ({
                        ...row,
                        options: row.options ? JSON.parse(row.options) : null
                    }))
                    resolve(questions)
                }
            })
        })
    }
}

module.exports = dbOperations
