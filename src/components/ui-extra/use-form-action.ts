"use client";

import { type FormEvent, startTransition, useActionState } from "react";

/**
 * useActionState for a <form>, without React 19's automatic reset.
 *
 * When a form submits through its `action` prop, React resets every
 * uncontrolled field once the action finishes, which wiped what someone had
 * typed when a save failed validation or didn't go through. Here the form is
 * submitted from onSubmit instead: it prevents React's built-in handling and
 * runs the same action in a transition, so `pending` still works and nothing is
 * reset (forms close on success, so nothing needs clearing).
 *
 * Spread the returned `form` props onto the <form>. `action` stays on it so a
 * submit before the page has hydrated still does nothing, as React intends.
 */
export function useFormAction<State>(
  action: (previous: Awaited<State>, data: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, initialState);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return { state, pending, form: { action: formAction, onSubmit } };
}
