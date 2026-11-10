import { AccessControlProvider } from './domains/access-control/context/AccessControlContext'
import WorkOrderWorkspacePage from './domains/work-orders/pages/WorkOrderWorkspacePage'

function App() {
  return <AccessControlProvider>
    <WorkOrderWorkspacePage />
  </AccessControlProvider>
}

export default App
