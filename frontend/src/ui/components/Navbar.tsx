import React from 'react'
import { Container, Group, Anchor, Button, ActionIcon, Burger, Paper, Transition, Title, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconMoon, IconSun } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'

const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Anchor component={Link} to={to} fz="sm">
    {children}
  </Anchor>
)

export function Navbar() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const bg = colorScheme === 'dark' ? 'rgba(2,6,23,0.65)' : 'rgba(255,255,255,0.7)'
  const border = colorScheme === 'dark' ? '1px solid rgba(51,65,85,.6)' : '1px solid rgba(226,232,240,.5)'

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'saturate(180%) blur(6px)', background: bg, borderBottom: border }}>
      <Container size="lg" py="sm">
        <Group justify="space-between" align="center">
          <Title order={4} style={{ margin: 0 }}>AcademiaPro</Title>
          <Group gap="md" visibleFrom="md" component="nav">
            <NavLink to="/">Inicio</NavLink>
            <NavLink to="#features">Características</NavLink>
            <NavLink to="#pricing">Planes</NavLink>
            <NavLink to="#contact">Contacto</NavLink>
          </Group>
          <Group gap="xs">
            <Button component={Link} to="/app" variant="outline" size="sm">Entrar</Button>
            <Button component={Link} to="/app" variant="filled" size="sm">Probar ahora</Button>
            <ActionIcon variant="default" size="sm" onClick={() => setColorScheme(colorScheme === 'light' ? 'dark' : 'light')}>
              {colorScheme === 'light' ? <IconMoon size={16} /> : <IconSun size={16} />}
            </ActionIcon>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
          </Group>
        </Group>
        <Transition mounted={opened} transition="pop-top-right" duration={150}>
          {(styles) => (
            <Paper style={styles} withBorder p="md" radius="md" hiddenFrom="md">
              <Stack gap="sm" onClick={close}>
                <NavLink to="/">Inicio</NavLink>
                <NavLink to="#features">Características</NavLink>
                <NavLink to="#pricing">Planes</NavLink>
                <NavLink to="#contact">Contacto</NavLink>
              </Stack>
            </Paper>
          )}
        </Transition>
      </Container>
    </header>
  )
}
