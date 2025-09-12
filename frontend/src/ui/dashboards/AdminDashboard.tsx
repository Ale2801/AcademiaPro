import React from 'react'
import { Button, Group } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { Admin } from '../Admin'
import { useAuth } from '../../lib/auth'

export default function AdminDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <DashboardLayout
      title="Panel de Administrador"
      subtitle="Gestión de usuarios, catálogos y cursos"
      actions={
        <Group>
          <Button variant="filled" color="dark" onClick={() => { logout(); navigate('/app') }}>Cerrar sesión</Button>
        </Group>
      }
    >
      <Admin />
    </DashboardLayout>
  )
}
