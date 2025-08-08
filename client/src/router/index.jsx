import { BrowserRouter, Navigate, useRoutes } from 'react-router-dom'
import React, {Suspense} from 'react'

// 路由懒加载
const Login = React.lazy(() => import('../pages/Login'))
const Home = React.lazy(() => import('../pages/Home'))
const Register = React.lazy(() => import('../pages/Register'))


const routes = [
    {
        path: '/',
        element: <Navigate to='/home' />
    },
    {
        path: '/login',
        element: <Login />
    },
    {
        path: '/home',
        element: <Home />
    },
    {
        path: '/register',
        element: <Register />

    }
]

function WrapperRoutes() {
    let ele = useRoutes(routes) // <Routes>{ele}</Routes>
    return (
        <Suspense fallback={<div>loading</div>}>
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


