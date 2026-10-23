import { FinanceError } from '../domain/errors';
import { ZodError } from 'zod';
export function userError(error: unknown): string {
  if (error instanceof FinanceError) return error.message;
  if (error instanceof ZodError) return 'Revise os campos: preencha os nomes, selecione os cadastros e informe datas e valores válidos.';
  return 'Não foi possível confirmar a operação no armazenamento local. Seus campos foram mantidos. Tente novamente sem alterá-los; não limpe os dados do navegador.';
}
