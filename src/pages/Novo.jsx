import { UserPlus } from 'lucide-react'
import { Card, Titulo } from '../components/ui'
import PessoaForm from '../components/PessoaForm'

export default function Novo() {
  return (
    <div>
      <Titulo icone={UserPlus}>Novo cadastro</Titulo>
      <Card className="p-4 sm:p-6">
        <PessoaForm />
      </Card>
    </div>
  )
}
