import React from 'react'
import { Container, Title, Text, Button, Group, Stack, SimpleGrid, Paper, ThemeIcon, Grid, Anchor } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import { Navbar } from './components/Navbar'
import { Link } from 'react-router-dom'
import { useBrandingSettings } from '../lib/settings'

function Hero() {
  return (
  <section className="lp-hero" style={{ padding: '7rem 0', textAlign: 'center' }}>
      <Container size="lg">
        <Stack gap="md" align="center">
          <Title order={1} size="h1" className="lp-section-title" style={{ fontWeight: 800 }}>Gestión académica simple y poderosa</Title>
          <Text c="dimmed" size="lg" style={{ maxWidth: 720 }}>Administra cursos, horarios, matrículas y más con una plataforma rápida y moderna.</Text>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button component={Link} to="/app" size="md" variant="filled">Comenzar gratis</Button>
            <Button variant="outline" size="md" component={Link} to="#features">Ver características</Button>
          </div>
        </Stack>
      </Container>
    </section>
  )
}

function Features() {
  const items = [
    { title: 'Horarios inteligentes', desc: 'Configura bloques y salas sin conflictos.' },
    { title: 'Matrículas y notas', desc: 'Gestiona el progreso de tus estudiantes.' },
    { title: 'Panel de administración', desc: 'CRUD rápido para todas las entidades.' },
    { title: 'API segura', desc: 'Autenticación JWT y roles.' },
    { title: 'UI rápida', desc: 'Construida con React y Vite.' },
    { title: 'Listo para producción', desc: 'Docker, tests y buenas prácticas.' },
  ]
  return (
  <section id="features" style={{ padding: '5rem 0' }}>
      <Container size="lg">
    <Title order={2} ta="center" mb="xl" className="lp-section-title">Características</Title>
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {items.map((f) => (
      <Paper key={f.title} p="xl" radius="lg" withBorder className="lp-card">
              <Group gap="sm" mb="xs" align="center">
                <ThemeIcon color="green" variant="light"><IconCircleCheck size={18} /></ThemeIcon>
                <Title order={4} m={0}>{f.title}</Title>
              </Group>
              <Text c="dimmed">{f.desc}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Container>
    </section>
  )
}

function Pricing() {
  const tiers = [
    { name: 'Gratis', price: '$0', features: ['Usuarios ilimitados', 'CRUD completo', 'API abierta'], cta: 'Probar' },
    { name: 'Pro', price: '$15/mes', features: ['Soporte prioritario', 'Backups', 'Integraciones'], cta: 'Comprar' },
    { name: 'Enterprise', price: 'Contáctanos', features: ['SSO', 'SLA dedicado', 'On-premise'], cta: 'Hablar' },
  ]
  return (
  <section id="pricing" className="lp-pricing" style={{ padding: '5rem 0' }}>
      <Container size="lg">
        <Title order={2} ta="center" mb="lg">Planes</Title>
        <Grid>
          {tiers.map(t => (
            <Grid.Col key={t.name} span={{ base: 12, md: 4 }}>
        <Paper p="xl" radius="lg" withBorder>
                <Stack gap="xs">
                  <Title order={4}>{t.name}</Title>
          <Title order={2} style={{ letterSpacing: '-0.02em' }}>{t.price}</Title>
                  <Stack gap={4}>
                    {t.features.map(f => (
                      <Group key={f} gap="xs"><ThemeIcon color="green" variant="light"><IconCircleCheck size={18} /></ThemeIcon><Text>{f}</Text></Group>
                    ))}
                  </Stack>
                  <Button mt="sm" variant="filled">{t.cta}</Button>
                </Stack>
              </Paper>
            </Grid.Col>
          ))}
        </Grid>
      </Container>
    </section>
  )
}

function Footer() {
  const { appName } = useBrandingSettings()
  return (
  <footer id="contact" className="lp-footer" style={{ padding: '2rem 0', borderTop: '1px solid #e2e8f0' }}>
      <Container size="lg">
        <Group justify="space-between" align="center">
          <Text>© {new Date().getFullYear()} {appName}</Text>
          <Group gap="lg">
            <Anchor component={Link} to="/app">Entrar</Anchor>
            <Anchor component={Link} to="#features">Características</Anchor>
            <Anchor component={Link} to="#pricing">Planes</Anchor>
          </Group>
        </Group>
      </Container>
    </footer>
  )
}

export default function Landing() {
  return (
    <div>
      <Navbar />
      <Hero />
      <Features />
      <Pricing />
      <Footer />
    </div>
  )
}
