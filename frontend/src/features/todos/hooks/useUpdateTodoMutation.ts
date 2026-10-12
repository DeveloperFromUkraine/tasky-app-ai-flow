import { useMutation, useQueryClient } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo, TodoInput } from '../types'

export function useUpdateTodoMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.update,
    mutationFn: ({ id, input }: { id: number; input: Partial<TodoInput> }) =>
      todosApi.update(id, input),
    onSuccess: async (saved) => {
      // The summary counts come from the server; refresh them after any change.
      void queryClient.invalidateQueries({ queryKey: todoKeys.stats })
      await queryClient.cancelQueries({ queryKey: todoKeys.list })
      queryClient.setQueryData<Todo[]>(todoKeys.list, (current) =>
        current?.map((todo) => (todo.id === saved.id ? saved : todo)),
      )
    },
  })
}
