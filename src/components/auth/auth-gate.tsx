"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TimeFlowLogo } from "@/components/layout/sidebar";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInSchema, signUpSchema, type SignInValues, type SignUpValues } from "@/lib/validation";
import { describeError, useAppStore } from "@/store/use-app-store";

type AuthMode = "sign-in" | "sign-up";

/**
 * Rendered by the app shell when Supabase is configured but there is no
 * session yet. Local Mode never reaches this screen because the local adapter
 * always returns a user.
 */
export function AuthGate() {
  const [mode, setMode] = useState<AuthMode>("sign-in");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <TimeFlowLogo />
          <p className="text-sm text-muted-foreground">
            Sign in to load your tasks, schedule and tracked time.
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="sign-up">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-1.5">
              <CardTitle className="text-base">
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {mode === "sign-in"
                  ? "Use the email and password you signed up with."
                  : "Your profile and starter categories are created automatically."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>{mode === "sign-in" ? <SignInForm /> : <SignUpForm />}</CardContent>
        </Card>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Want to try TimeFlow without a database? Leave the Supabase keys empty in{" "}
          <code className="rounded bg-muted px-1 py-0.5">.env.local</code> to run in Local Mode.
        </p>
      </div>
    </div>
  );
}

function SignInForm() {
  const signIn = useAppStore((state) => state.signIn);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SignInValues) => {
    setPending(true);
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      toast.success("Signed in");
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="sign-in-email">Email</Label>
        <Input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sign-in-password">Password</Label>
        <Input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}

function SignUpForm() {
  const signUp = useAppStore((state) => state.signUp);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", display_name: "" },
  });

  const onSubmit = async (values: SignUpValues) => {
    setPending(true);
    setFormError(null);
    try {
      await signUp(values.email, values.password, values.display_name);
      // With email confirmation enabled Supabase returns no session, so the
      // shell stays on this screen -- tell the user what to do next.
      if (useAppStore.getState().user) {
        toast.success("Account created");
      } else {
        toast.info("Check your inbox to confirm your email, then sign in.");
      }
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="space-y-2">
        <Label htmlFor="sign-up-name">Name</Label>
        <Input id="sign-up-name" autoComplete="name" {...form.register("display_name")} />
        {form.formState.errors.display_name ? (
          <p className="text-xs text-destructive">{form.formState.errors.display_name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sign-up-email">Email</Label>
        <Input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sign-up-password">Password</Label>
        <Input
          id="sign-up-password"
          type="password"
          autoComplete="new-password"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create account
      </Button>
    </form>
  );
}
