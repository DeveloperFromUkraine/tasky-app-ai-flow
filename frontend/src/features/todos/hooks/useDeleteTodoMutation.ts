import { useMutation, useQueryClient } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'

export function useDeleteTodoMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.delete,
    mutationFn: (id: number) => todosApi.remove(id),
    onSuccess: async (_, id) => {
      // The summary counts come from the server; refresh them after any change.
      void queryClient.invalidateQueries({ queryKey: todoKeys.stats })
      await queryClient.cancelQueries({ queryKey: todoKeys.list })
      queryClient.setQueryData<Todo[]>(todoKeys.list, (current) =>
        current?.filter((todo) => todo.id !== id),
      )
    },
  })
}
