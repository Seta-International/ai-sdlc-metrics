'use client'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@future/ui'

interface RehireDialogProps {
  open: boolean
  onClose: () => void
  employeeName: string
}

export function RehireDialog({ open, onClose, employeeName }: RehireDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rehire {employeeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rehire-start-date">New start date</Label>
            <Input id="rehire-start-date" type="date" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rehire-employment-type">Employment type</Label>
            <Select>
              <SelectTrigger id="rehire-employment-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="fixed_term">Fixed-term</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rehire-job-title">Job title</Label>
            <Input id="rehire-job-title" placeholder="e.g. Senior Engineer" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onClose()
            }}
          >
            Start rehire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
