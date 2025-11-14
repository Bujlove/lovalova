const { v4: uuidv4 } = require('uuid');

// In-memory store (в продакшене нужно использовать БД)
// В реальности это должно быть внешнее хранилище (YDB, Postgres)
const projects = {};

function templateFiles(template) {
  if (template === 'react-spa') {
    return {
      'src/App.jsx': 'export default function App() {\n  return <div>Hello Alice LLM!</div>;\n}\n',
      'package.json': '{"name": "alice-app", "version": "0.1.0"}'
    };
  }
  return { 'README.md': '# Новый проект\n' };
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => { resolve(body); });
  });
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vercel может передавать путь по-разному
  const path = req.url || req.path || '';
  const pathParts = path.split('/').filter(p => p);
  
  // POST /api/projects или /projects
  if (req.method === 'POST' && (path === '/api/projects' || path === '/projects' || (pathParts.length === 1 && pathParts[0] === 'projects'))) {
    try {
      const bodyStr = typeof req.body === 'string' ? req.body : await getBody(req);
      const { name, template } = JSON.parse(bodyStr || '{}');
      const projectId = uuidv4();
      const project = {
        id: projectId,
        name: name || 'New Project',
        files: templateFiles(template)
      };
      projects[projectId] = project;
      return res.status(201).json(project);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // GET /api/projects/:id
  if (req.method === 'GET' && pathParts.length >= 2 && pathParts[pathParts.length - 2] === 'projects') {
    try {
      const projectId = pathParts[pathParts.length - 1];
      if (!projects[projectId]) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(200).json(projects[projectId]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // GET /api/projects/:id/files
  if (req.method === 'GET' && pathParts.length >= 3 && pathParts[pathParts.length - 1] === 'files') {
    try {
      const projectId = pathParts[pathParts.length - 2];
      if (!projects[projectId]) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const files = Object.entries(projects[projectId].files || {}).map(([path, content]) => ({
        path,
        content
      }));
      return res.status(200).json(files);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT /api/projects/:id/files
  if (req.method === 'PUT' && pathParts.length >= 3 && pathParts[pathParts.length - 1] === 'files') {
    try {
      const projectId = pathParts[pathParts.length - 2];
      if (!projects[projectId]) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const bodyStr = typeof req.body === 'string' ? req.body : await getBody(req);
      const { path: filePath, content } = JSON.parse(bodyStr || '{}');
      projects[projectId].files[filePath] = content;
      return res.status(200).json(projects[projectId]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(404).json({ error: 'Not found' });
};

