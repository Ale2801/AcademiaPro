import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Center, Loader, Stack, Text } from '@mantine/core'

import Landing from '../Landing'
import { useBrandingSettings } from '../../lib/settings'

export default function LandingRoute() {
  const { enableLanding, portalUrl, loaded } = useBrandingSettings()
  const [redirected, setRedirected] = useState(false)

  useEffect(() => {
    if (loaded && !enableLanding && portalUrl && !redirected) {
      setRedirected(true)
      if (typeof window !== 'undefined') {
        window.location.href = portalUrl
      }
    }
  }, [enableLanding, loaded, portalUrl, redirected])

  if (!loaded) {
    return (
      <Center mih="60vh">
        <Loader />
      </Center>
    )
  }

  if (!enableLanding) {
    if (portalUrl) {
      return (
        <Center mih="60vh">
          <Stack gap="xs" align="center">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">Redirigiendo a portal institucional…</Text>
          </Stack>
        </Center>
      )
    }
    return <Navigate to="/app" replace />
  }

  return <Landing />
}
