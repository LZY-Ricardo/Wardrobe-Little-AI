import { BrowserRouter, Navigate, useRoutes } from 'react-router-dom'
import React, {Suspense} from 'react'
import Layout from '@/components/Layout'


// 路由懒加载
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
        path: '/register',
        element: <Register />

    },
    {
        path: '/home',
        element: (
            <Layout>
                <Home />
            </Layout>
        )
    },
    {
        path: '/match',
        element: (
            <Layout>
                <Match />
            </Layout>
        )
    },
    {
        path: '/outfit',
        element: (
            <Layout>
                <Outfit />
            </Layout>
        )
    },
    {
        path: '/recommend',
        element: (
            <Layout>
                <Recommend />
            </Layout>
        )
    },
    {
        path: '/person',
        element: (
            <Layout>
                <Person />
            </Layout>
        )
    },
    {
        path: '/add',
        element: (
            <Layout>
                <Add />
            </Layout>
        )
    },
    {
        path: '/update',
        element: (
            <Layout>
                <Update />
            </Layout>
        )
    },
    {
        path: '/aichat',
        element: (
            <Layout>
                <AiChat />
            </Layout>
        )
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


