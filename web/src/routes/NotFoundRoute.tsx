import { InfoPage } from '../components/InfoPage'

export function NotFoundRoute() {
  return (
    <InfoPage title="Page not found">
      <p>The page you requested does not exist.</p>
    </InfoPage>
  )
}
