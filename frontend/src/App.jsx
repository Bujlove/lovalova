import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function App() {
  const [projectName, setProjectName] = useState('Demo проект')
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [editorValue, setEditorValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState('')

  const selectedFile = useMemo(() => files.find((f) => f.path === selectedPath), [files, selectedPath])

  const handleCreateProject = async () => {
    setStatus('Создание проекта...')
    try {
      const response = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, template: 'react-spa' }),
      })
      if (!response.ok) throw new Error('Не удалось создать проект')
      const data = await response.json()
      setProject(data)
      setFiles(Object.entries(data.files || {}).map(([path, content]) => ({ path, content })))
      setStatus('Проект готов')
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
    if (data.length > 0 && !selectedPath) {
      setSelectedPath(data[0].path)
      setEditorValue(data[0].content)
    }
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
    } catch (error) {
      console.error(error)
      setStatus('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return
    const nextMessages = [...chatMessages, { role: 'user', content: inputMessage }]
    setChatMessages(nextMessages)
    setInputMessage('')
    setIsSending(true)
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project?.id,
          messages: nextMessages,
        }),
      })
      if (!response.ok) throw new Error('LLM вернул ошибку')
      const data = await response.json()
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (error) {
      console.error(error)
      setStatus('Ошибка при обращении к модели')
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (project?.id) {
      refreshFiles(project.id)
    }
  }, [project?.id])

  return (
    <div className="app">
      <header>
        <h1>Сборка на Alice LLM</h1>
        <p>Простой MVP для российских пользователей</p>
      </header>

      <section className="project-bar">
        <input
          type="text"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Название проекта"
        />
        <button onClick={handleCreateProject}>Создать проект</button>
        <span className="status">{status}</span>
      </section>

      <div className="workspace">
        <aside className="file-panel">
          <h3>Файлы</h3>
          {files.length === 0 && <p className="empty">Файлы не найдены</p>}
          <ul>
            {files.map((file) => (
              <li key={file.path}>
                <button
                  className={file.path === selectedPath ? 'active' : ''}
                  onClick={() => handleSelectFile(file)}
                >
                  {file.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main>
          <div className="editor-header">
            <h3>{selectedPath ?? 'Выберите файл'}</h3>
            <button onClick={handleSaveFile} disabled={!selectedPath || isSaving}>
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
          <textarea
            value={editorValue}
            onChange={(event) => setEditorValue(event.target.value)}
            placeholder="Код появится здесь"
            disabled={!selectedPath}
          />
        </main>

        <section className="chat-panel">
          <h3>Alice LLM</h3>
          <div className="chat-log">
            {chatMessages.map((msg, index) => (
              <div key={`msg-${index}`} className={`chat-msg ${msg.role}`}>
                <strong>{msg.role === 'assistant' ? 'Alice' : 'Вы'}:</strong> {msg.content}
              </div>
            ))}
          </div>
          <textarea
            value={inputMessage}
            onChange={(event) => setInputMessage(event.target.value)}
            placeholder="Опишите, что нужно сделать"
          />
          <button onClick={handleSendMessage} disabled={isSending}>
            {isSending ? 'Думает...' : 'Спросить'}
          </button>
        </section>
      </div>
    </div>
  )
}

export default App
