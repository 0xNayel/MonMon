import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import DiffView from './pages/DiffView'
import Alerts from './pages/Alerts'
import Logs from './pages/Logs'
import System from './pages/System'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('monmon_token')
  return token ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="checks/:id/diff" element={<DiffView />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="logs" element={<Logs />} />
        <Route path="system" element={<System />} />
      </Route>
    </Routes>
  )
}
