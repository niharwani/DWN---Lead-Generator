/**
 * Onboarding step dispatcher.
 *
 * Reads the current onboarding state and renders the appropriate step
 * component. If onboarding is already complete, redirects to /overview.
 * If the user has no state yet (first visit), initialises at step 1.
 */

import { redirect } from "next/navigation";
import { requirePageOwner } from "@/lib/data";
import { getOnboardingState } from "@/lib/onboarding/state";

import { WhoStep } from "./_steps/01-who";
import { WhatStep } from "./_steps/02-what";
import { IcpStep } from "./_steps/03-icp";
import { ServicesStep } from "./_steps/04-services";
import { IntegrationsStep } from "./_steps/05-integrations";
import { DoneStep } from "./_steps/done";

export default async function OnboardingPage() {
  const owner = await requirePageOwner();
  const state = await getOnboardingState(owner.id);

  if (state.completed) {
    redirect("/overview");
  }

  switch (state.step) {
    case 1:
      return <WhoStep state={state} />;
    case 2:
      return <WhatStep state={state} />;
    case 3:
      return <IcpStep state={state} />;
    case 4:
      return <ServicesStep state={state} />;
    case 5:
      return <IntegrationsStep state={state} />;
    case 6:
      return <DoneStep />;
    default:
      return <WhoStep state={state} />;
  }
}
