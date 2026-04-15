"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    Loader2,
    Save,
    Check,
    AlertCircle,
    Trash2,
    Edit,
    TestTube,
    Plus,
    Globe,
    FileText,
    ExternalLink,
    CheckCircle2,
    XCircle,
    AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface WordPressConfig {
    id: string;
    site_url: string;
    username: string;
    created_at: string;
    updated_at: string;
}

export default function WordPressSettingsPage() {
    const [configs, setConfigs] = useState<WordPressConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testingMarkdown, setTestingMarkdown] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [markdownTestResult, setMarkdownTestResult] = useState<any>(null);

    // Form state
    const [siteUrl, setSiteUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/wordpress/config");
            const json = await response.json();

            if (json.data) {
                setConfigs(json.data);
            }
        } catch (err) {
            toast.error("Failed to load WordPress configurations");
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        if (!siteUrl || !username || !password) {
            toast.error("Please fill in all fields");
            return;
        }

        setTesting(true);
        console.log("=== TEST CONNECTION DEBUG ===");
        console.log("Current window location:", window.location.href);
        console.log("Testing WordPress connection:", { site_url: siteUrl, username });
        console.log("Fetch URL:", new URL("/api/wordpress/test", window.location.href).toString());

        try {
            // Use relative URL to avoid mixed content issues
            const apiUrl = "/api/wordpress/test";
            console.log("Current page protocol:", window.location.protocol);
            console.log("Current page origin:", window.location.origin);
            console.log("Fetching relative URL:", apiUrl);

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    site_url: siteUrl,
                    username,
                    password,
                }),
            });

            console.log("Test response status:", response.status);

            if (!response.ok && response.status === 0) {
                throw new Error("Network request failed. This might be due to CORS, network connectivity, or the server not responding.");
            }

            let json;
            try {
                json = await response.json();
            } catch (parseError: any) {
                console.error("JSON parse error:", parseError);
                throw new Error("Server returned invalid response. Check server logs.");
            }
            console.log("===== RESPONSE DEBUG =====");
            console.log("Full response:", JSON.stringify(json, null, 2));
            console.log("response.ok:", response.ok);
            console.log("json.success:", json.success);
            console.log("json.data:", json.data);
            console.log("json.message:", json.message);
            console.log("json.error:", json.error);
            console.log("Condition check - response.ok:", response.ok, "has data or success:", !!(json.data || json.success));
            console.log("========================");

            // Handle both full response (with data) and simple response (just success/message)
            if (response.ok && (json.data || json.success)) {
                if (json.data) {
                    // Full WordPress test response
                    const { site_name, rest_api_version, user_capabilities, message } = json.data;

                    // Build description text
                    let description = `${site_name || message}`;
                    if (rest_api_version) {
                        description += `\nREST API: ${rest_api_version}`;
                    }
                    if (user_capabilities) {
                        const perms = [
                            user_capabilities.can_publish ? '✓ Publish' : '✗ Publish',
                            user_capabilities.can_edit ? '✓ Edit' : '✗ Edit',
                            user_capabilities.can_upload ? '✓ Upload' : '✗ Upload',
                        ];
                        description += `\nPermissions: ${perms.join(', ')}`;
                    }

                    toast.success(description);
                } else {
                    toast.success(json.message || "API endpoint is reachable");
                }
            } else {
                const errMsg = typeof json.error === 'string' ? json.error : json.error?.message;
                toast.error(errMsg || json.details || "Could not connect to WordPress");
            }
        } catch (err: any) {
            console.error("Test connection error:", err);
            toast.error(err.message || "Network error occurred. Check if the site URL is correct.");
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!siteUrl || !username) {
            toast.error("Please fill in site URL and username");
            return;
        }

        if (!editingId && !password) {
            toast.error("Password is required for new configurations");
            return;
        }

        setSaving(true);
        try {
            const method = editingId ? "PUT" : "POST";
            const url = editingId
                ? `/api/wordpress/config/${editingId}`
                : "/api/wordpress/config";

            const body: any = {
                site_url: siteUrl,
                username,
            };

            // Only include password if provided
            if (password) {
                body.password = password;
            }

            console.log("Saving WordPress config:", { method, url, body: { ...body, password: body.password ? '***' : undefined } });

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const responseData = await response.json();
            console.log("Save response:", { ok: response.ok, status: response.status, data: responseData });

            if (!response.ok) {
                // Show detailed error message (prioritize 'message' field for detailed info)
                const errorMessage = responseData.message
                    || (typeof responseData.error === 'string' ? responseData.error : responseData.error?.message)
                    || "Failed to save configuration";
                throw new Error(errorMessage);
            }

            toast.success(editingId ? "Configuration updated" : "Configuration saved");

            // Reset form
            setSiteUrl("");
            setUsername("");
            setPassword("");
            setShowForm(false);
            setEditingId(null);

            // Refresh list
            await fetchConfigs();
        } catch (err: any) {
            console.error("Save error:", err);
            toast.error(err.message || "Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (config: WordPressConfig) => {
        setEditingId(config.id);
        setSiteUrl(config.site_url);
        setUsername(config.username);
        setPassword(""); // Don't populate password for security
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await fetch(`/api/wordpress/config/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to delete configuration");
            }

            toast.success("Configuration deleted");

            fetchConfigs();
        } catch (err) {
            toast.error("Failed to delete configuration");
        } finally {
            setDeleteId(null);
        }
    };

    const handleCancel = () => {
        setSiteUrl("");
        setUsername("");
        setPassword("");
        setShowForm(false);
        setEditingId(null);
    };

    const handleTestMarkdown = async (configId: string) => {
        setTestingMarkdown(true);
        setMarkdownTestResult(null);
        try {
            const response = await fetch("/api/wordpress/test-markdown", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config_id: configId }),
            });

            const json = await response.json();

            if (!response.ok) {
                throw new Error(json.error || "Failed to test markdown conversion");
            }

            setMarkdownTestResult(json.data);

            toast.success("Test post created in WordPress. Please review and delete it.");
        } catch (err: any) {
            toast.error(err.message || "Failed to test markdown conversion");
        } finally {
            setTestingMarkdown(false);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">WordPress Settings</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage WordPress site connections for publishing
                    </p>
                </div>
                {!showForm && (
                    <Button onClick={() => setShowForm(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Configuration
                    </Button>
                )}
            </div>

            {/* Configuration Form */}
            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {editingId ? "Edit" : "New"} WordPress Configuration
                        </CardTitle>
                        <CardDescription>
                            Enter your WordPress site credentials. Password will be encrypted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="site_url">Site URL</Label>
                            <Input
                                id="site_url"
                                type="url"
                                value={siteUrl}
                                onChange={(e) => setSiteUrl(e.target.value)}
                                placeholder="https://your-site.com"
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                The full URL of your WordPress site
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="admin"
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                WordPress admin username
                            </p>
                        </div>

                        <div>
                            <Label htmlFor="password">
                                {editingId ? "Application Password (leave blank to keep current)" : "Application Password"}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={editingId ? "••••••••" : "xxxx xxxx xxxx xxxx"}
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Create an Application Password in WordPress: Users → Profile → Application Passwords
                            </p>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button
                                onClick={handleTestConnection}
                                variant="outline"
                                disabled={testing || !siteUrl || !username || !password}
                                className="gap-2"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <TestTube className="h-4 w-4" />
                                        Test Connection
                                    </>
                                )}
                            </Button>

                            <Button
                                onClick={handleSave}
                                disabled={saving || !siteUrl || !username || (!password && !editingId)}
                                className="gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        Save Configuration
                                    </>
                                )}
                            </Button>

                            <Button onClick={handleCancel} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Configurations List */}
            <Card>
                <CardHeader>
                    <CardTitle>Saved Configurations</CardTitle>
                    <CardDescription>
                        Manage your WordPress site connections
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : configs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No WordPress configurations yet</p>
                            <p className="text-sm mt-1">
                                Add your first configuration to start publishing
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Site URL</TableHead>
                                    <TableHead>Username</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {configs.map((config) => (
                                    <TableRow key={config.id}>
                                        <TableCell className="font-mono text-sm">
                                            {config.site_url}
                                        </TableCell>
                                        <TableCell>{config.username}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {new Date(config.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleEdit(config)}
                                                    className="gap-1"
                                                >
                                                    <Edit className="h-3 w-3" />
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => setDeleteId(config.id)}
                                                    className="gap-1"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="border-info/20 bg-info/5">
                <CardContent className="pt-4">
                    <div className="flex gap-3">
                        <div className="text-info">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 text-sm">
                            <p className="font-medium text-foreground">
                                🔒 Encryption Required
                            </p>
                            <p className="text-info">
                                WordPress passwords are encrypted using AES-256-GCM before storage.
                                Make sure <code className="bg-info/10 px-1 py-0.5 rounded text-xs">ENCRYPTION_SECRET</code> is
                                set in your <code className="bg-info/10 px-1 py-0.5 rounded text-xs">.env</code> file.
                            </p>
                            <p className="text-info text-xs mt-1">
                                💡 Generate a secret: <code className="bg-info/10 px-1 py-0.5 rounded">npm run generate:secret</code>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Markdown Conversion Test */}
            {configs.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Test Markdown Conversion
                        </CardTitle>
                        <CardDescription>
                            Test how markdown content will be converted to HTML in WordPress
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-start gap-3 p-3 bg-warning/5 border border-warning/20 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                            <div className="space-y-1 text-sm">
                                <p className="font-medium text-foreground">
                                    Test Post Will Be Created
                                </p>
                                <p className="text-warning">
                                    This test will create a draft post titled "<strong>[TEST - PLEASE DELETE]</strong>" in your WordPress site.
                                    You must manually delete it after reviewing the conversion results.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {configs.map((config) => (
                                <Button
                                    key={config.id}
                                    onClick={() => handleTestMarkdown(config.id)}
                                    disabled={testingMarkdown}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {testingMarkdown ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Testing...
                                        </>
                                    ) : (
                                        <>
                                            <TestTube className="h-4 w-4" />
                                            Test {new URL(config.site_url).hostname}
                                        </>
                                    )}
                                </Button>
                            ))}
                        </div>

                        {markdownTestResult && (
                            <div className="space-y-4 pt-4 border-t">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold">Test Results</h3>
                                    <Badge
                                        variant={
                                            markdownTestResult.conversion_report.overall_status === "success"
                                                ? "default"
                                                : markdownTestResult.conversion_report.overall_status === "warning"
                                                    ? "secondary"
                                                    : "destructive"
                                        }
                                        className="gap-1"
                                    >
                                        {markdownTestResult.conversion_report.overall_status === "success" && (
                                            <CheckCircle2 className="h-3 w-3" />
                                        )}
                                        {markdownTestResult.conversion_report.overall_status === "warning" && (
                                            <AlertTriangle className="h-3 w-3" />
                                        )}
                                        {markdownTestResult.conversion_report.overall_status === "fail" && (
                                            <XCircle className="h-3 w-3" />
                                        )}
                                        {markdownTestResult.conversion_report.overall_status.toUpperCase()}
                                    </Badge>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
                                        <ExternalLink className="h-4 w-4 text-info" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                WordPress Test Post Created
                                            </p>
                                            <div className="flex gap-3 mt-1">
                                                <a
                                                    href={markdownTestResult.post_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-info hover:underline"
                                                >
                                                    View Post →
                                                </a>
                                                <a
                                                    href={markdownTestResult.edit_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-info hover:underline"
                                                >
                                                    Edit in WordPress →
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    <Accordion type="single" collapsible className="w-full">
                                        <AccordionItem value="features">
                                            <AccordionTrigger>
                                                Feature Conversion Report ({markdownTestResult.conversion_report.features.length} tests)
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <div className="space-y-2">
                                                    {markdownTestResult.conversion_report.features.map((feature: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-start gap-3 p-3 border rounded-lg"
                                                        >
                                                            <div className="mt-0.5">
                                                                {feature.status === "pass" && (
                                                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                                                )}
                                                                {feature.status === "warning" && (
                                                                    <AlertTriangle className="h-4 w-4 text-warning" />
                                                                )}
                                                                {feature.status === "fail" && (
                                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 space-y-1">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="font-medium text-sm">{feature.name}</p>
                                                                    <Badge
                                                                        variant={
                                                                            feature.status === "pass"
                                                                                ? "default"
                                                                                : feature.status === "warning"
                                                                                    ? "secondary"
                                                                                    : "destructive"
                                                                        }
                                                                        className="text-xs"
                                                                    >
                                                                        {feature.status}
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {feature.details}
                                                                </p>
                                                                <div className="flex gap-4 text-xs">
                                                                    <span className="text-muted-foreground">
                                                                        Expected: <span className="font-mono">{feature.expected}</span>
                                                                    </span>
                                                                    <span className="text-muted-foreground">
                                                                        Actual: <span className="font-mono">{feature.actual}</span>
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="markdown">
                                            <AccordionTrigger>Test Markdown Source</AccordionTrigger>
                                            <AccordionContent>
                                                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                                                    {markdownTestResult.test_markdown}
                                                </pre>
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="html">
                                            <AccordionTrigger>HTML Output</AccordionTrigger>
                                            <AccordionContent>
                                                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-96">
                                                    {markdownTestResult.html_output}
                                                </pre>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Configuration?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this WordPress configuration.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteId && handleDelete(deleteId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
