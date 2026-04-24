import { Navigate, useLocation } from 'react-router-dom'

export default function Agent() {
  const location = useLocation()
  return <Navigate to="/unified-agent" replace state={location.state} />
}
