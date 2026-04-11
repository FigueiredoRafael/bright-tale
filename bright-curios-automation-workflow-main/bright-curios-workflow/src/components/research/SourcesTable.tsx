"use client";

import { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Pencil, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { SourceForm } from "./SourceForm";
import { deleteSource, type Source } from "@/lib/api/research";

interface SourcesTableProps {
    researchId: string;
    sources: Source[];
    loading?: boolean;
    onUpdate: () => void;
}

export function SourcesTable({
    researchId,
    sources,
    loading = false,
    onUpdate,
}: SourcesTableProps) {
    const { toast } = useToast();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [sourceToEdit, setSourceToEdit] = useState<Source | null>(null);

    const handleDeleteClick = (source: Source) => {
        setSourceToDelete(source);
        setDeleteDialogOpen(true);
    };

    const handleEditClick = (source: Source) => {
        setSourceToEdit(source);
        setEditDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!sourceToDelete) return;

        setDeleting(true);
        try {
            await deleteSource(researchId, sourceToDelete.id);

            toast({
                title: "Source deleted",
                description: `${sourceToDelete.title} has been removed.`,
            });

            onUpdate();
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to delete source",
            });
        } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
            setSourceToDelete(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!sources || sources.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <p>No sources added yet.</p>
                <p className="text-sm mt-1">Add your first source to get started.</p>
            </div>
        );
    }

    return (
        <>
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Author</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sources.map((source) => (
                            <TableRow key={source.id}>
                                <TableCell>
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-blue-600 hover:underline"
                                    >
                                        <span className="font-medium">{source.title}</span>
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                </TableCell>
                                <TableCell>
                                    {source.author || (
                                        <span className="text-muted-foreground italic">—</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {source.date ? (
                                        format(new Date(source.date), "MMM d, yyyy")
                                    ) : (
                                        <span className="text-muted-foreground italic">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditClick(source)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteClick(source)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Dialog */}
            {sourceToEdit && (
                <SourceForm
                    researchId={researchId}
                    source={sourceToEdit}
                    open={editDialogOpen}
                    onOpenChange={(open) => {
                        setEditDialogOpen(open);
                        if (!open) setSourceToEdit(null);
                    }}
                    onSuccess={() => {
                        setSourceToEdit(null);
                        onUpdate();
                    }}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Source</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{sourceToDelete?.title}&quot;?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
