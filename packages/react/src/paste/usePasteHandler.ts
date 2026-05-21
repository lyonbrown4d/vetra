import { useMemo } from 'react'
import { useEditor } from '@vetra/react/context/EditorContext'
import {
  createPasteHandler,
  type CreatePasteHandlerOptions,
  type PasteHandler,
} from '@vetra/react/paste/createPasteHandler'

export type UsePasteHandlerOptions = Omit<CreatePasteHandlerOptions, 'editor'>

export function usePasteHandler(options: UsePasteHandlerOptions): PasteHandler {
  const editor = useEditor()
  const { idFactory, plainText, strategy, target } = options

  return useMemo(() => {
    return createPasteHandler({
      editor,
      target,
      ...(idFactory === undefined ? {} : { idFactory }),
      ...(strategy === undefined ? {} : { strategy }),
      ...(plainText === undefined ? {} : { plainText }),
    })
  }, [editor, idFactory, plainText, strategy, target])
}
