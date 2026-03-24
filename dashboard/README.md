# AI Config OS Dashboard

React + Vite dashboard for the AI Config OS runtime.

## Top-level navigation tabs

The dashboard uses these eight top-level tabs (source of truth: `dashboard/src/App.jsx`):

1. **Tasks**
2. **Tools**
3. **Skills**
4. **Context Cost**
5. **Config**
6. **Audit**
7. **Analytics**
8. **Bootstrap Runs**

## Tasks and Task Detail

**Task Detail** is a nested view inside the **Tasks** tab (not a separate top-level tab).  
Selecting a task in `Tasks` opens the Task Detail view from the task list.

## Local development

```bash
npm install
npm run dev
```

The dashboard expects the MCP/dashboard API on `http://localhost:4242` by default.

