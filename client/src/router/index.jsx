import React, { Suspense } from 'react'
import { BrowserRouter, Navigate, useLocation, useRoutes } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Skeleton } from '@/components/Feedback'
import { useAuthStore } from '@/store'

const Login = React.lazy(() => import('../pages/Login'))
const Home = React.lazy(() => import('../pages/Home'))
const Register = React.lazy(() => import('../pages/Register'))
const Match = React.lazy(() => import('../pages/Match'))
const Outfit = React.lazy(() => import('../pages/Outfit'))
const Recommend = React.lazy(() => import('../pages/Recommend'))
const Person = React.lazy(() => import('../pages/Person'))
const Add = React.lazy(() => import('../pages/Add'))
const Update = React.lazy(() => import('../pages/Update'))
const AiChat = React.lazy(() => import('../pages/AiChat'))

const isAuthed = () => {
  const token = useAuthStore.getState().accessToken || localStorage.getItem('access_token')
  return Boolean(token)
}

const ProtectedRoute = ({ children }) => {
  const location = useLocation()
  if (!isAuthed()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ redirect: `${location.pathname}${location.search}` }}
      />
    )
  }
  return children
}

const RedirectIfAuthed = ({ children }) => {
  if (isAuthed()) {
    return <Navigate to="/home" replace />
  }
  return children
}

const withLayout = (node) => <Layout>{node}</Layout>

const routes = [
  { path: '/', element: <Navigate to="/home" replace /> },
  { path: '/login', element: <RedirectIfAuthed><Login /></RedirectIfAuthed> },
  { path: '/register', element: <RedirectIfAuthed><Register /></RedirectIfAuthed> },
  {
    path: '/home',
    element: (
      <ProtectedRoute>
        {withLayout(<Home />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/match',
    element: (
      <ProtectedRoute>
        {withLayout(<Match />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/outfit',
    element: (
      <ProtectedRoute>
        {withLayout(<Outfit />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/recommend',
    element: (
      <ProtectedRoute>
        {withLayout(<Recommend />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/person',
    element: (
      <ProtectedRoute>
        {withLayout(<Person />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/add',
    element: (
      <ProtectedRoute>
        {withLayout(<Add />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/update',
    element: (
      <ProtectedRoute>
        {withLayout(<Update />)}
      </ProtectedRoute>
    ),
  },
  {
    path: '/aichat',
    element: (
      <ProtectedRoute>
        {withLayout(<AiChat />)}
      </ProtectedRoute>
    ),
  },
]

function WrapperRoutes() {
  const ele = useRoutes(routes)
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      {ele}
    </Suspense>
  )
}

export default function WrapperRouter() {
  return (
    <BrowserRouter>
      <WrapperRoutes />
    </BrowserRouter>
  )
}