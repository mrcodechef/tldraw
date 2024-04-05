import {
	Editor,
	StateNode,
	TLArrowShape,
	TLEventHandlers,
	TLHandle,
	TLNoteShape,
	TLPointerEventInfo,
	Vec,
} from '@tldraw/editor'
import {
	NOTE_CENTER_OFFSET,
	getNoteAdjacentPositions,
	getNoteShapeForAdjacentPosition,
} from '../../../shapes/note/noteHelpers'
import { startEditingShapeWithLabel } from '../../../shapes/shared/TextHelpers'

export class PointingHandle extends StateNode {
	static override id = 'pointing_handle'

	info = {} as TLPointerEventInfo & { target: 'handle' }

	override onEnter = (info: TLPointerEventInfo & { target: 'handle' }) => {
		this.info = info

		const { shape } = info
		if (this.editor.isShapeOfType<TLArrowShape>(shape, 'arrow')) {
			const initialTerminal = shape.props[info.handle.id as 'start' | 'end']

			if (initialTerminal?.type === 'binding') {
				this.editor.setHintingShapes([initialTerminal.boundShapeId])
			}
		}

		this.editor.updateInstanceState(
			{ cursor: { type: 'grabbing', rotation: 0 } },
			{ ephemeral: true }
		)
	}

	override onExit = () => {
		this.editor.setHintingShapes([])
		this.editor.updateInstanceState(
			{ cursor: { type: 'default', rotation: 0 } },
			{ ephemeral: true }
		)
	}

	override onPointerUp: TLEventHandlers['onPointerUp'] = () => {
		const { shape, handle } = this.info

		if (this.editor.isShapeOfType<TLNoteShape>(shape, 'note')) {
			const { editor } = this
			const nextNote = getNoteForPit(editor, shape, handle, false)
			if (nextNote) {
				startEditingShapeWithLabel(editor, nextNote, true /* selectAll */)
				return
			}
		}

		this.parent.transition('idle', this.info)
	}

	override onPointerMove: TLEventHandlers['onPointerMove'] = () => {
		const { editor } = this
		if (editor.inputs.isDragging) {
			if (this.editor.getInstanceState().isReadonly) return

			const { shape, handle } = this.info

			if (editor.isShapeOfType<TLNoteShape>(shape, 'note')) {
				const nextNote = getNoteForPit(editor, shape, handle, true)
				if (nextNote) {
					// Center the shape on the current pointer
					const centeredOnPointer = editor
						.getPointInParentSpace(nextNote, editor.inputs.originPagePoint)
						.sub(Vec.Rot(NOTE_CENTER_OFFSET, nextNote.rotation))
					editor.updateShape({ ...nextNote, x: centeredOnPointer.x, y: centeredOnPointer.y })

					// Then select and begin translating the shape
					editor
						.setHoveredShape(nextNote.id) // important!
						.select(nextNote.id)
						.setCurrentTool('select.translating', {
							...this.info,
							target: 'shape',
							shape: editor.getShape(nextNote),
							onInteractionEnd: 'note',
							isCreating: true,
							onCreate: () => {
								// When we're done, start editing it
								startEditingShapeWithLabel(editor, nextNote, true /* selectAll */)
							},
						})
					return
				}
			}

			this.startDraggingHandle()
		}
	}

	override onLongPress: TLEventHandlers['onLongPress'] = () => {
		this.startDraggingHandle()
	}

	private startDraggingHandle() {
		if (this.editor.getInstanceState().isReadonly) return
		this.parent.transition('dragging_handle', this.info)
	}

	override onCancel: TLEventHandlers['onCancel'] = () => {
		this.cancel()
	}

	override onComplete: TLEventHandlers['onComplete'] = () => {
		this.cancel()
	}

	override onInterrupt = () => {
		this.cancel()
	}

	private cancel() {
		this.parent.transition('idle')
	}
}

function getNoteForPit(editor: Editor, shape: TLNoteShape, handle: TLHandle, forceNew: boolean) {
	const pageTransform = editor.getShapePageTransform(shape.id)!
	const pagePoint = pageTransform.point()
	const pageRotation = pageTransform.rotation()
	const pits = getNoteAdjacentPositions(pagePoint, pageRotation, shape.props.growY, 0)
	const index = editor.getShapeHandles(shape.id)!.findIndex((h) => h.id === handle.id)
	if (pits[index]) {
		const pit = pits[index]
		return getNoteShapeForAdjacentPosition(editor, shape, pit, pageRotation, forceNew)
	}
}
