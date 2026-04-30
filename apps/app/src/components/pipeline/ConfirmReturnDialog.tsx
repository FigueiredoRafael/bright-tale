'use client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  onContinue: () => void
  onStop: () => void
}

export function ConfirmReturnDialog({ open, onContinue, onStop }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue autopilot?</AlertDialogTitle>
          <AlertDialogDescription>
            You finished the manual step. Continue running on autopilot, or finish the rest of the
            pipeline manually?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStop}>Finish manually</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continue autopilot →</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
