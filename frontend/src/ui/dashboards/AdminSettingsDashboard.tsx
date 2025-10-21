import React from 'react'
import { Button, Group } from '@mantine/core'
import { useNavigate } from 'react-router-dom'

import DashboardLayout from './DashboardLayout'
import ApplicationSettings from '../components/ApplicationSettings'
import { useAuth } from '../../lib/auth'

export default function AdminSettingsDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <DashboardLayout
      title="Ajustes de aplicación"
      subtitle="Personaliza la identidad visual y los parámetros operativos de la plataforma."
      actions={(
        <Group>
          <Button
            variant="filled"
            color="dark"
            onClick={() => {
              logout()
              navigate('/app')
            }}
          >
            Cerrar sesión
          </Button>
        </Group>
      )}
    >
      <ApplicationSettings />
    </DashboardLayout>
  )
}
