import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

function App() {
  const [projectName, setProjectName] = useState('Мой сайт')
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [editorValue, setEditorValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [status, setStatus] = useState('')

  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath), [files, selectedPath])

  const getLanguage = (path) => {
    if (path.endsWith('.html')) return 'html'
    if (path.endsWith('.css')) return 'css'
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'
    if (path.endsWith('.json')) return 'json'
    return 'plaintext'
  }

  const handleCreateProject = async () => {
    setStatus('Создание проекта...')
    try {
      const response = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, template: 'html-site' }),
      })
      if (!response.ok) throw new Error('Не удалось создать проект')
      const data = await response.json()
      setProject(data)
      setFiles(Object.entries(data.files || {}).map(([path, content]) => ({ path, content })))
      if (data.files && Object.keys(data.files).length > 0) {
        const firstFile = Object.keys(data.files)[0]
        setSelectedPath(firstFile)
        setEditorValue(data.files[firstFile])
      }
      setStatus('Проект создан')
    } catch (error) {
      console.error(error)
      setStatus('Ошибка создания проекта')
    }
  }

  const refreshFiles = async (projectId) => {
    if (!projectId) return
    const response = await fetch(`${API_BASE}/api/projects/${projectId}/files`)
    if (!response.ok) {
      setStatus('Не удалось загрузить файлы')
      return
    }
    const data = await response.json()
    setFiles(data)
  }

  const handleSelectFile = (file) => {
    setSelectedPath(file.path)
    setEditorValue(file.content)
  }

  const handleSaveFile = async () => {
    if (!project || !selectedPath) return
    setIsSaving(true)
    try {
      const response = await fetch(`${API_BASE}/api/projects/${project.id}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content: editorValue }),
      })
      if (!response.ok) throw new Error('Не удалось сохранить файл')
      setStatus('Сохранено')
      await refreshFiles(project.id)
      updatePreview()
    } catch (error) {
      console.error(error)
      setStatus('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }

  const updatePreview = () => {
    if (!project) return
    const htmlFile = files.find(f => f.path.endsWith('.html'))
    const cssFile = files.find(f => f.path.endsWith('.css'))
    const jsFile = files.find(f => f.path.endsWith('.js'))
    
    if (htmlFile) {
      let html = htmlFile.content
      
      // Вставляем CSS если есть
      if (cssFile) {
        const styleTag = `<style>${cssFile.content}</style>`
        html = html.replace('</head>', `${styleTag}</head>`)
      }
      
      // Вставляем JS если есть
      if (jsFile) {
        const scriptTag = `<script>${jsFile.content}</script>`
        html = html.replace('</body>', `${scriptTag}</body>`)
      }
      
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || !project) return
    
    setIsGenerating(true)
    setStatus('Генерация кода...')
    
    try {
      const projectFilesObj = {}
      files.forEach(f => {
        projectFilesObj[f.path] = f.content
      })
      
      const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          projectFiles: projectFilesObj,
          currentFile: selectedPath,
        }),
      })
      
      if (!response.ok) throw new Error('Ошибка генерации')
      
      const data = await response.json()
      const generatedCode = data.code || data.raw
      
      // Определяем, какой файл обновить
      let targetPath = selectedPath
      if (!targetPath || !targetPath.endsWith('.html')) {
        // Если нет выбранного файла или это не HTML, создаем/обновляем index.html
        targetPath = 'index.html'
      }
      
      // Обновляем файл
      setEditorValue(generatedCode)
      setSelectedPath(targetPath)
      
      // Сохраняем автоматически
      const saveResponse = await fetch(`${API_BASE}/api/projects/${project.id}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, content: generatedCode }),
      })
      
      if (saveResponse.ok) {
        await refreshFiles(project.id)
        updatePreview()
        setStatus('Код сгенерирован и сохранен')
        setPrompt('')
      }
    } catch (error) {
      console.error(error)
      setStatus('Ошибка генерации кода')
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (project?.id) {
      refreshFiles(project.id)
    }
  }, [project?.id])

  useEffect(() => {
    updatePreview()
  }, [files, editorValue])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🚀 Сборщик сайтов с AI</h1>
          <div className="header-actions">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Название проекта"
              className="project-name-input"
            />
            {!project ? (
              <button onClick={handleCreateProject} className="btn btn-primary">
                Создать проект
              </button>
            ) : (
              <span className="project-status">✓ Проект: {project.name}</span>
            )}
          </div>
        </div>
      </header>

      {!project ? (
        <div className="welcome-screen">
          <div className="welcome-content">
            <h2>Создавайте сайты с помощью AI</h2>
            <p>Опишите, какой сайт вам нужен, и AI сгенерирует код</p>
            <div className="examples">
              <h3>Примеры запросов:</h3>
              <ul>
                <li>"Создай сайт-визитку для фотографа"</li>
                <li>"Сделай лендинг для стартапа"</li>
                <li>"Создай портфолио для дизайнера"</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="workspace">
          <div className="left-panel">
            <div className="panel-section">
              <h3>📁 Файлы проекта</h3>
              <div className="file-list">
                {files.length === 0 ? (
                  <p className="empty">Нет файлов</p>
                ) : (
                  files.map((file) => (
                    <button
                      key={file.path}
                      className={`file-item ${file.path === selectedPath ? 'active' : ''}`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="file-icon">📄</span>
                      {file.path}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="panel-section">
              <h3>✨ Генерация с AI</h3>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Опишите, что нужно создать или изменить..."
                className="prompt-input"
                rows={4}
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="btn btn-generate"
              >
                {isGenerating ? '⏳ Генерирую...' : '✨ Сгенерировать код'}
              </button>
            </div>
          </div>

          <div className="center-panel">
            <div className="editor-header">
              <span className="file-name">{selectedPath || 'Выберите файл'}</span>
              <button
                onClick={handleSaveFile}
                disabled={!selectedPath || isSaving}
                className="btn btn-save"
              >
                {isSaving ? 'Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
            <div className="editor-container">
              {selectedPath ? (
                <Editor
                  height="100%"
                  language={getLanguage(selectedPath)}
                  value={editorValue}
                  onChange={(value) => setEditorValue(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                  }}
                />
              ) : (
                <div className="editor-placeholder">
                  <p>Выберите файл для редактирования</p>
                </div>
              )}
            </div>
          </div>

          <div className="right-panel">
            <div className="panel-section">
              <h3>👁️ Предпросмотр</h3>
              <div className="preview-container">
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="preview-frame"
                    title="Preview"
                  />
                ) : (
                  <div className="preview-placeholder">
                    <p>Предпросмотр появится после создания HTML файла</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="status-bar">
          <span>{status}</span>
        </div>
      )}
    </div>
  )
}

export default App
