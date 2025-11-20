import fs from 'fs'
import path from 'path'

const distDir = path.resolve('dist')
const publicDir = path.resolve('public')
const staticHtml = path.resolve('src/static/index.html')

fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(distDir, { recursive: true })

const html = fs.readFileSync(staticHtml, 'utf8')
fs.writeFileSync(path.join(distDir, 'index.html'), html)

if (fs.existsSync(publicDir)) {
  for (const entry of fs.readdirSync(publicDir)) {
    const srcPath = path.join(publicDir, entry)
    const destPath = path.join(distDir, entry)
    fs.cpSync(srcPath, destPath, { recursive: true, force: true })
  }
}

console.log('Demo static site built to ./dist')
