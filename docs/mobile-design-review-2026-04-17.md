# NeuraLaunch Mobile — Design Review

**Date:** 2026-04-17
**Scope:** mobile/src/ (React Native / Expo SDK 54, expo-router). Every screen, component, hook, service, and theme token.
**Standard of comparison:** Things 3, Linear Mobile, Superhuman, Claude iOS (Anthropic), Apollo (Reddit), Notion Mobile, Arc Search.
**Prerequisite:** the web design review at docs/design-review-2026-04-16.md. This document builds on those findings; it does not repeat them.

---

## 1. Executive summary

The NeuraLaunch mobile app sits approximately **40% of the way from "responsive web wrapper" to "native-feeling premium app."** The architecture is sound — there is a real theme system, a real component library, real safe area handling, real haptic feedback, and a navigation hierarchy that maps correctly to the product's use cases. The engineering team clearly understands React Native and has made good foundational decisions. But the app has not yet crossed the threshold where a founder picks it up and thinks *this was built for my hand.*

The most precise diagnosis: **the app has platform awareness without platform fluency.** It knows about safe areas, so nothing clips. It knows about haptics, so touches vibrate. It knows about keyboard avoidance, so inputs don't hide. But it doesn't use bottom sheets for contextual actions (it uses inline dropdowns). It doesn't use swipe gestures for the most common task actions (it uses tiny ghost buttons). It doesn't use shared element transitions between screens (it uses default stack pushes). It doesn't use spring physics for its animations (it uses linear timing). It doesn't use a scroll-to-bottom FAB for its chat interfaces (it auto-scrolls and hopes for the best). These are the differences between an app that runs on a phone and an app that belongs on a phone.



The strongest asset is the haptic feedback integration. Every meaningful interaction — button press, status change, selection, navigation, completion, error — fires the correct haptic weight. This is ahead of most production React Native apps and gives the NeuraLaunch mobile app a tactile quality that partially compensates for the visual and gestural gaps.

The most urgent problem is the same one the web review identified: the fork picker. On mobile, it's worse. The fork cards look identical to the parking lot cards below them. On a 6-inch screen, the founder can't even see all the forks without scrolling past the "closing reflection" card. The moment of decision — pick your next direction — is indistinguishable from a reference section.

The second most urgent problem is touch target compliance. The send button in every chat interface is 32x32 points. The collapsible section header is ~24pt tall. Small-size buttons are 32pt tall. Apple's HIG minimum is 44x44pt. Material Design specifies 48x48dp. A founder with normal-sized thumbs on a Tecno phone will mis-tap these controls constantly.

---

## 2. Navigation and information architecture

### Tab structure

**Tabs:** Roadmap (home) | Sessions | Tools | Settings

The default tab is Roadmap. This is the correct choice for a returning founder who has an active roadmap — they open the app, they see their tasks. But for a **new** founder who has never started a discovery, the Roadmap tab shows an empty state that says "No roadmap yet" and directs them to the Sessions tab. This means the first-run experience on mobile is:

1. Open app after sign-in
2. See empty state with "Start a discovery" CTA on the Roadmap tab
3. Tap CTA, which pushes to Sessions tab
4. Tap "Start new discovery" CTA on Sessions tab
5. Navigate to /discovery

That's three screens and two taps before the founder reaches the first meaningful interaction. Linear Mobile solves this by detecting first-run state and showing a setup flow inline on the home tab. Claude iOS opens directly to the input. NeuraLaunch should detect "zero roadmaps" state and render the discovery CTA directly on the Roadmap tab instead of bouncing the user to Sessions.

The Sessions tab as a recommendation history browser is correct and well-structured. The Tools tab as a standalone tool launcher is structurally sound but needs the launcher to actually launch (see Section 6). The Settings tab is comprehensive — account, consent, notifications, legal, sign-out — and correctly positioned as the fourth tab.

### Navigation depth

The deepest path is: Roadmap tab → Task card → Check-in screen (3 levels). For tools: Roadmap tab → Task card → Coach → (state machine within one screen, 4 phases). This is within the acceptable range for mobile. The critical test is back-button behavior — every screen uses expo-router's Stack with a header back button, which works correctly.

### Navigation dead-ends

One identified: the `StandaloneToolLauncher` component fetches roadmaps, and if no active roadmap exists, shows an EmptyState with a "Start a discovery" button. But that button pushes to `/(tabs)/sessions`, which is a tab — and when the user eventually creates a roadmap and returns, they're dropped back at Sessions, not at the tool they originally wanted. The mental model breaks.

### Deep linking

The URL scheme (`/roadmap/[id]`, `/recommendation/[id]`, `/roadmap/[id]/coach`) is clean and hierarchical. Push notifications correctly deep-link to `/roadmap/[id]` via the `attachNotificationTapListener`. Cold launch handling is present (`handleColdLaunchNotification`). This is above average for the stage.

### Tab bar implementation

The tab bar ([_layout.tsx:(tabs)](mobile/src/app/(tabs)/_layout.tsx)) uses proper safe area insets (`paddingBottom: insets.bottom > 0 ? insets.bottom : spacing[2]`), correct icon sizes (22pt via `iconSize.lg`), and the label style is appropriately small (10pt, `typography.size['2xs']`). The tab bar height calculation (`56 + insets.bottom`) is correct for iOS notch devices. The icons (Home, LayoutGrid, Wrench, Settings) are standard Lucide — functional but not distinctive. Things 3 and Linear Mobile use custom tab icons that carry brand personality. The NeuraLaunch tab bar is correct but generic.

---

## 3. Surface-by-surface review

### 3.1 Onboarding — [onboarding.tsx](mobile/src/app/onboarding.tsx)

**Verdict: structurally correct, emotionally flat.**

The four-screen carousel communicates the right things in the right order: (1) brand promise — you know something needs to change; (2) the interview and one-recommendation commitment; (3) the three tools; (4) call to action. The paging mechanism uses a horizontal ScrollView with `pagingEnabled` — native-feeling on iOS, adequate on Android. The dot indicators animate width (active=24pt, inactive=8pt), which is the correct pattern. Haptic feedback fires on each page change. Skip button is present on non-final pages.

**What's missing:**

- **No spring physics on the dot transition.** The dots snap from 8px to 24px with no interpolation. Things 3's onboarding dots use a spring-driven width animation that gives the indicator a sense of physical continuity. NeuraLaunch's dots feel like state toggles, not a position indicator.
- **No visual artifacts.** All four slides are text + Lucide icon. The tools slide shows three colored icon badges — a good move — but the other three slides are centered text on a dark background. Arc Search's onboarding shows the actual product. Superhuman's shows velocity. NeuraLaunch shows words about a product the founder hasn't seen yet.
- **Both CTAs on slide 4 go to the same place.** "Start your discovery" and "I already have an account — sign in" both call `finish()` which routes to `/sign-in`. This is technically correct (auth is required either way), but the copy implies two different destinations. Rewrite the second to "Sign in" — no pretense of a different path.
- **The "NL" logo badge on slide 1** is 80x80pt, `borderRadius: 20`, with `typography.size['2xl']` text. This is a placeholder. It's the right size and shape for a logo mark, but "NL" in blue on a blue-tinted square is not a logo. When a real mark exists, slot it here.

**Would a 22-year-old in Freetown with a Tecno phone on 3G feel this app was made for them?** The voice on slide 1 — "You know something needs to change" — would land. The voice on slide 2 — "It starts with a conversation" — is good. But the product shows no evidence of itself during onboarding. If this founder has never heard of NeuraLaunch, they're trusting the copy alone. A single screenshot of a real recommendation or a real roadmap on slide 2 would convert the skeptical.

### 3.2 Sign-in — [sign-in.tsx](mobile/src/app/sign-in.tsx)

**Verdict: minimal and clean.** Two OAuth buttons (Google, GitHub), centered brand text, legal footer. The buttons use `variant="secondary"` (bordered, not filled), which is the correct treatment for third-party auth — the provider's action, not yours. No icons on the buttons (Google colored icon vs GitHub monochrome was a problem on web; solved here by omitting both). The brand text "From lost to launched. For everyone." is the right line in the right place.

**Fix:** Add a subtitle below "NeuraLaunch" that sets expectations for what happens after sign-in: "Your first interview takes 8-12 minutes." This was recommended for the web sign-in page too. It reduces post-auth anxiety and increases completion.

### 3.3 Discovery interview — [discovery/index.tsx](mobile/src/app/discovery/index.tsx)

**Verdict: functional chat, not yet a native-feeling conversation.**

The good: KeyboardAvoidingView is present with platform-specific behavior. FlatList for messages with `keyExtractor` and auto-scroll on new messages. Synthesis progress card with encouraging copy ("Analysing your context, researching your market, and crafting one honest recommendation. This takes about 30 seconds."). Session resumption detection on mount. Interview guide accessible via header help icon.

**Critical issues:**

1. **Chat bubble text is 13px.** The ChatBubble component ([ChatBubble.tsx](mobile/src/components/ui/ChatBubble.tsx)) sets `fontSize: typography.size.sm` (13px) with `lineHeight: 13 * 1.625 = 21.1px`. On a phone screen at arm's length, 13px is too small for comfortable reading of paragraphs. Claude iOS uses 15-16px for message text. Bump to `typography.size.base` (15px).

2. **The send button is 32x32 points.** The send button in [ChatInput.tsx](mobile/src/components/ui/ChatInput.tsx) is explicitly sized `width: 32, height: 32`. Apple HIG minimum is 44x44pt. This button will be mis-tapped by every user with average-sized fingers. Increase to 44x44pt with a 36pt visible circle and 44pt hit area.

3. **The send button uses a text character '↑' instead of a proper icon.** This is the single cheapest-looking element in the entire mobile app. Claude iOS uses a filled arrow icon. Notion Mobile uses a send-plane icon. Replace with Lucide's `ArrowUp` or `SendHorizontal` icon.

4. **No scroll-to-bottom button.** When the founder scrolls up to re-read a previous question and a new message arrives, auto-scroll fires and yanks them to the bottom. Apollo handles this with a "scroll to bottom" FAB that appears when the user is scrolled away from the latest message, and only auto-scrolls when they're already at the bottom. This is standard practice for chat UIs.

5. **The welcome state vanishes immediately.** "Tell me about your situation" renders only when `messages.length === 0 && !isLoading`. The moment the session initializes and the first assistant message streams, the welcome disappears. On a fast connection, the founder sees it for under a second. On a slow connection, they see it for longer but then it pops away. Claude iOS keeps its welcome visible until the user starts typing.

6. **No space for voice mode.** The ChatInput has a text field and a send button. The product vision mentions voice mode as a future feature. There's no space reserved for a microphone button. When voice mode arrives, the input bar will need a layout change. Reserve the space now — a right-aligned mic icon that's hidden but occupies width — so the transition is seamless.

7. **Keyboard offset is hardcoded to 90.** `keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}` assumes a specific header height. If the header changes (e.g., a progress indicator is added), the offset breaks. Use the header's measured height instead.

### 3.4 Recommendation reveal — [recommendation/[id].tsx](mobile/src/app/recommendation/[id].tsx)

**Verdict: all seven collapsible sections open by default on a 6-inch screen is not a recommendation reveal — it's a document.**

The web review identified seven stacked collapsibles as the right shape for the data. On web, the screen is wide enough that the user can see several sections at once, and the collapsible headers create visual breaks. On mobile, seven open sections produce a scroll that can exceed ten screen-lengths. The founder receives their recommendation and sees: a summary card, the falsification statement, and then seven open sections of text that require sustained scrolling to reach the accept CTA at the bottom. This is reading a document, not experiencing a moment.

**Specific issues:**

1. **The summary card uses `variant="primary"` (subtle blue tint).** The recommendation is the product's single most important output. A subtle blue tint is a blog post callout. This card should be visually dominant — larger text (`variant="title"` not `variant="body"`), gold border (not blue), more padding, perhaps a gold-tinted background (`secondaryAlpha10`).

2. **"What Would Make This Wrong" uses `fontStyle: 'italic'`.** The web review called this out as the wrong treatment. The same problem exists on mobile. The falsification statement is the most important piece of epistemic honesty the product ships. Italic on mobile reads as parenthetical. Render it regular weight, in `foreground` color, visually equal to the summary.

3. **CollapsibleSection header touch target is too small.** The header has `paddingVertical: spacing[2]` (8pt). With the text and chevron, the total touch area is approximately 24-28pt tall. Below the 44pt minimum. The founder will miss-tap the collapse control repeatedly.

4. **CollapsibleSection uses a '▼' text character for the chevron.** Same problem as the send button — a text character pretending to be an icon. Use Lucide's `ChevronDown` with proper sizing.

5. **Seven sections should NOT all be open by default on mobile.** The `defaultOpen` prop defaults to `true` in [CollapsibleSection.tsx](mobile/src/components/ui/CollapsibleSection.tsx). On mobile, only the summary, the path, and the first three steps should be open by default. The rest (risks, assumptions, alternatives) should be collapsed, revealing themselves when tapped. This cuts the initial scroll depth by approximately 60%.

6. **The pushback chat is below the accept CTA.** The recommendation screen ends with: separator → accept CTA → pushback chat → alternative link. A founder who scrolls to accept must scroll past the pushback section. Conversely, a founder who wants to push back must scroll past the accept CTA to reach the chat. On mobile, these should be two distinct actions with clear hierarchy — perhaps the pushback as a "Not convinced?" link that expands the chat, rather than rendering it inline by default.

7. **No gold anywhere on the recommendation.** The web uses gold for the summary card border. The mobile recommendation uses blue (primary variant). Gold is the product's "moment" color — it should appear here.

### 3.5 Roadmap — [roadmap/[id].tsx](mobile/src/app/roadmap/[id].tsx), [RoadmapViewer.tsx](mobile/src/components/roadmap/RoadmapViewer.tsx)

**Verdict: the strongest surface in the mobile app.**

**What works well:**

- **ProgressHeader** ([ProgressHeader.tsx](mobile/src/components/roadmap/ProgressHeader.tsx)) — compact, information-dense, correct. Shows weeks, hours/week, task count, progress bar with percentage, blocked-task badge, nudge banner. This is what the web review asked for ("a persistent header at the top") and the mobile app already has it. Preserve this.
- **Phase grouping** — PhaseBlock renders a phase number badge, title, objective, duration, and its task cards. The visual hierarchy (phase title → tasks) is clear.
- **Closing thought with gold accent** — the "Your Next Move" card uses `c.secondary` (gold) for the overline. This is correct use of the accent color for a high-value moment.
- **Continuation CTA** — appears only after tasks are completed, with appropriate copy.
- **Pull-to-refresh** — on the Roadmap tab via ScreenContainer.

**What needs work:**

1. **TaskCard action buttons overflow on narrow screens.** The actions row uses `flexDirection: 'row'` with `gap: 8px`. A task with all four tool buttons (Coach, Outreach, Research, Package) plus the Check-in button produces five buttons in a row. On a 360px-wide screen (common for mid-range Android), this overflows. The actions row needs `flexWrap: 'wrap'` or, better, a rethink: the four tool buttons should be in a secondary row or behind a "Tools" expand.

2. **Tool buttons use `variant="ghost"` `size="sm"`.** Ghost buttons at small size are borderless text links with 14px Lucide icons. On a phone, these are nearly invisible as interactive elements. A founder will not intuitively understand these are tappable buttons. Add a subtle background tint (`primaryAlpha5`) to make them read as controls, or use `variant="secondary"` with compact padding.

3. **TaskStatusPicker is the right pattern.** Unlike the web's native `<select>`, the mobile app uses a tappable Badge that reveals an inline picker below the header. This is correct for mobile. However, a bottom sheet would be even more native-feeling — the inline dropdown pushes content down, which on a long task card causes a jarring layout shift. A bottom sheet slides up from the thumb zone, presents the four options, and dismisses.

4. **No swipe gestures.** Things 3 lets you swipe a task to complete it, swipe to schedule it, long-press for contextual options. Apollo lets you swipe a comment to upvote, downvote, or save. NeuraLaunch's task cards have zero gesture support. Adding swipe-to-complete (the most common action) would dramatically reduce the friction of the most frequent interaction in the app.

### 3.6 Check-in — [checkin.tsx](mobile/src/app/roadmap/[id]/checkin.tsx)

**Verdict: well-designed form, good for thumb.**

The category selection uses a 2x2 grid of pill-shaped pressables with `minWidth: '45%'` and `flexGrow: 1`. Touch targets are generous (`paddingVertical: spacing[2.5]` = 10pt + text height, producing approximately 36-40pt total). The emojis (check, prohibition, exclamation, question) are clear without being playful. The placeholder text changes per category — a detail that shows someone thought about the experience.

**Issues:**

1. **The text area uses a raw `require('react-native').TextInput` inside an IIFE.** This is a workaround pattern that indicates the `TextInput` component from the UI library didn't work for multiline. The code at lines 249-268 dynamically requires `TextInput` from react-native. This works but is fragile and suggests the `TextInput` primitive needs a `multiline` prop.

2. **The "Step complete" moment for completed tasks** is a primary-variant card with "Step complete" text and a task counter. This is the right content but the wrong ceremony. Completing a task is the single most emotionally positive moment in the roadmap flow. It deserves a success haptic (already present), a green success color (not blue primary), and ideally a brief scale-up animation on the "Step complete" text. Things 3 makes task completion feel like an achievement; NeuraLaunch makes it feel like a form submission acknowledgment.

3. **Category pills should be 44pt minimum height.** The current padding produces approximately 36-40pt, which is borderline. Bump to `paddingVertical: spacing[3]` (12pt) for reliable 44pt hit areas.

4. **No voice mode placeholder.** Same issue as the discovery chat — no space reserved for a microphone button next to the text input.

### 3.7 Continuation and fork picker — [continuation.tsx](mobile/src/app/roadmap/[id]/continuation.tsx)

**Verdict: the web review called the fork picker "the single most important UX failure in the product." The mobile version is marginally better but still not a moment.**

What the mobile version does right that the web doesn't:
- Fork selection fires `Haptics.ImpactFeedbackStyle.Medium` — the heaviest haptic in the app. Someone thought about this.
- Selected fork gets a 2px blue border and an inline loading state with "Building your next recommendation..." copy.

What's still wrong:
1. **Fork cards look identical to parking lot cards.** Same Card component, same padding, same text hierarchy. The fork picker section heading is `variant="title"` ("What could come next"); the parking lot heading is also `variant="title"` ("Your parking lot"). Visually indistinguishable.

2. **No gold accent on the decision moment.** The fork picker should be the one place in the continuation flow where gold appears. The overline "What could come next" should be gold, not default. The selected fork's border should be gold, not primary blue. This is the decision — give it the decision color.

3. **The closing reflection card sits above the fork picker.** On a phone, the founder opens the continuation screen and sees... a closing reflection card that requires reading before scrolling to the actual decision. Reverse the order: forks first (the actionable thing), reflection below (the retrospective context). Or, put the reflection in a collapsed section so the forks are immediately visible.

4. **No animation on fork selection.** Tapping a fork adds a 2px border and (during API call) shows an ActivityIndicator. There's no expansion animation, no confirmation state, no sense that a significant action just happened. When the API returns, `router.replace` fires and the screen disappears. The fork selection should expand the chosen card, fade the others, show a brief success state, then navigate.

### 3.8 Tools — coach, outreach, research, packager

#### Conversation Coach — [coach.tsx](mobile/src/app/roadmap/[id]/coach.tsx) + [components/coach/](mobile/src/components/coach/)

**Verdict: the four-phase state machine is the right pattern for mobile.** Setup → Preparation → Role-play → Debrief all render within a single screen, eliminating screen transitions between phases. The phase indicator (badge at the top) gives context. SetupChat uses the ChatBubble/ChatInput primitives. PreparationView renders collapsible sections for each preparation element (opening script, asks, objections, fallback, checklist). The copy-to-clipboard button on the opening script is essential and present.

**Fix:** RolePlayChat shows a "REHEARSAL MODE" badge, which is correct visual framing. But the role-play messages use the same ChatBubble as the discovery interview — same colors, same sizes. The role-play is a fundamentally different interaction (practicing, not answering). Differentiate the bubbles — perhaps a different assistant-bubble color (muted gold instead of muted gray?) or a subtle "In character" label on the other party's messages.

#### Outreach Composer — [outreach.tsx](mobile/src/app/roadmap/[id]/outreach.tsx) + [ComposerMessageCard.tsx](mobile/src/components/outreach/ComposerMessageCard.tsx)

**Verdict: the message card is the strongest individual component in the tools suite.** It renders subject, body, annotation, with copy/share actions and a "Mark as sent" toggle. Sent messages render at 0.75 opacity — a clean visual distinction. The regenerate form allows custom instructions with a cap of 2 variations. The coach handoff button appears when appropriate.

**Issue:** The message body renders as plain `Text variant="body"`. For WhatsApp messages, this is correct. For emails, the subject line and body should have more visual distinction — perhaps the subject in `variant="label"` with a separator before the body. For LinkedIn connection requests, the 300-character limit should be visually indicated (a character counter).

#### Research Tool — [research.tsx](mobile/src/app/roadmap/[id]/research.tsx)

**Verdict: data-dense output on a small screen.** Research findings can include businesses, people, competitors, data points, regulations — each with contact info, source URLs, and confidence levels. On a phone, this is a lot of content per finding card.

**Fix:** Finding cards should use progressive disclosure. Show the finding title, type badge, and confidence level at the top. Contact info, source URLs, and the roadmap connection should be in a "More details" expand. The current flat rendering produces finding cards that can be 200+ points tall, forcing the founder to scroll extensively through a single finding to reach the next one.

#### Service Packager — [packager.tsx](mobile/src/app/roadmap/[id]/packager.tsx)

**Verdict: the three-tier pricing display is handled correctly.** At 730 lines this file is significantly over the 300-line limit and should be split, but the UX decision to render tiers vertically (scrollable cards, one per tier) rather than side-by-side (three columns) is the right call for mobile. Three columns at phone width would produce unreadable text.

#### Standalone Tool Launcher — [StandaloneToolLauncher.tsx](mobile/src/components/tools/StandaloneToolLauncher.tsx)

**Verdict: not a launcher, a redirect.** The component fetches roadmaps, finds the most recent active one, and `router.replace()`s to the tool screen on that roadmap. If no roadmap exists, it shows an EmptyState. The founder never sees a "launching" UI — they tap "Coach" on the Tools tab and see a loading spinner, then are redirected to `/roadmap/[id]/coach`. This feels disorienting. The component should show a brief "Opening Conversation Coach..." state with the tool's icon, then navigate. The redirect should use `router.push()` not `router.replace()` so the back button returns to the Tools tab.

### 3.9 Validation — [validation/index.tsx](mobile/src/app/validation/index.tsx), [validation/[pageId].tsx](mobile/src/app/validation/[pageId].tsx)

Not reviewed in detail — the validation pages are view-only on mobile (no creation, no editing). This is the correct scope for mobile. Founders will manage validation pages from desktop; mobile is for checking status and sharing the URL.

### 3.10 Settings — [settings.tsx](mobile/src/app/(tabs)/settings.tsx)

**Verdict: comprehensive and well-structured.** User card with avatar initial, "Your work" nav section (past recommendations, validation pages), connected accounts, notification toggle, privacy consent toggle, legal links, sign-out. The consent toggle uses optimistic UI with rollback on error — correct pattern.

**Fix:** The sign-out button uses `variant="ghost"` which renders as blue text on the dark background. Sign-out should be destructive-styled (red text) or at minimum use `c.destructive` color to signal the action's severity. The `Alert.alert` confirmation with "destructive" style on the confirm button is correct, but the trigger button should match.

---

## 4. Primitive library assessment

### Strong primitives

| Primitive | Verdict | Notes |
|---|---|---|
| **Button** | Strong | Three variants, three sizes, haptic feedback, loading state, full-width option, accessibility labels. `md` (44pt min-height) meets touch target. |
| **Card** | Strong | Three variants (default/primary/muted), scheme-aware shadows, consistent radius (16pt). |
| **Badge** | Good | Six variants (default, primary, success, warning, destructive, muted). Compact sizing appropriate for mobile. |
| **ScreenContainer** | Strong | Safe area handling, pull-to-refresh, keyboard avoidance, scroll/non-scroll modes. The most important primitive and it's solid. |
| **EmptyState** | Good | Icon + title + message + optional CTA. Centered, generous padding. Guides the user forward. |
| **ErrorState** | Good | Three presets (generic, network, auth) with appropriate icons. Retry button. |
| **Skeleton** | Good | Pulsing animation between muted shades. Preset layouts (CardSkeleton, ListSkeleton). |
| **FadeInView** | Good | Configurable entrance animation with opacity + translateY. Uses Animated API for Expo Go compatibility. |
| **Text** | Strong | Six variants with proper type scale. Color defaults per variant (caption/overline auto-mute). Weight and align overrides. |

### Primitives that need work

| Primitive | Issue | Fix |
|---|---|---|
| **ChatBubble** | Text at 13px too small; maxWidth as string cast `as any` | Bump text to 15px (base). Fix maxWidth type. |
| **ChatInput** | Send button 32x32 (below 44pt); '↑' text character; no voice slot | 44x44 hit area; Lucide icon; reserve mic button space |
| **CollapsibleSection** | '▼' text character; header touch target ~24pt; no height animation on collapse | Lucide ChevronDown; 44pt header height; LayoutAnimation or Animated for content height |
| **TextInput** | No multiline support (check-in screen works around it with raw RN TextInput) | Add `multiline` prop, `numberOfLines`, auto-grow |
| **TypingIndicator** | Functional but positioned inline in FlatList footer | Position it as an overlay that floats above the input bar, like iMessage |
| **Separator** | Works but uses fixed vertical margin (`marginVertical: spacing[3]`) | Accept margin as a prop for contextual spacing |

### Missing primitives

| Primitive | Why it's needed | Reference |
|---|---|---|
| **BottomSheet** | Task status changes, tool launchers, confirmations. Every native iOS/Android app uses sheets for contextual actions. The inline TaskStatusPicker works, but a sheet is the platform convention. | Gorhom bottom-sheet or a custom Animated implementation. |
| **ActionButton (FAB)** | Scroll-to-bottom in chat, "New discovery" quick action | Things 3's add button, Claude iOS's scroll-to-bottom |
| **ProgressRing** | Synthesis progress, research execution progress, brief generation | Circular progress indicator for long-running AI operations |
| **Toast / Snackbar** | Success confirmations, error messages that don't block the flow | "Check-in submitted" toast after the check-in form, replacing the full-screen response |
| **SwipeAction** | Swipe-to-complete on task cards, swipe-to-dismiss on notifications | Things 3's swipe gestures, Apollo's comment actions |

---

## 5. Theme and design token assessment

### Alignment with web

| Token | Web value | Mobile value | Aligned? |
|---|---|---|---|
| Primary (blue) | #2563EB | #2563EB | Yes |
| Secondary (gold) | #D4A843 | #D4A843 | Yes |
| Dark background | #070F1C (deepest) / #0A1628 (card) | #0A1628 (background) / #111B2E (card) | Partial — web's deepest navy (#070F1C) is not in the mobile palette. Mobile background (#0A1628) maps to web's card color, not web's deepest background. |
| Success | #10B981 | #10B981 | Yes |
| Destructive | #EF4444 | #EF4444 | Yes |
| Warning | #F59E0B | #F59E0B | Yes |
| Muted foreground | --muted-foreground (slate-400) | #94A3B8 (slate-400) | Yes |
| Border | --border (slate-800 area) | #1E293B | Yes |

The mobile theme is **well-aligned** with the web palette. The one drift — using #0A1628 as background instead of #070F1C — is acceptable because mobile screens are smaller and slightly lighter backgrounds improve text readability at arm's length. This is an intentional-feeling divergence.

### Theme structure

The theme system is **ahead of the web** in several areas:

1. **Animation tokens exist.** `animation.fast` (150ms), `animation.normal` (250ms), `animation.slow` (400ms). The web review recommended exactly this ("three canonical durations") and the mobile app already has it.

2. **Icon size scale exists.** Five named sizes (`xs` through `xl`) with specific pixel values. The web has no equivalent — icon sizes drift across components.

3. **Shadow system is scheme-aware.** Dark mode gets higher shadow opacity and larger radius to compensate for black shadows being invisible on dark backgrounds. This is a detail I've only seen in mature design systems.

4. **Alpha variants for brand colors.** `primaryAlpha5`, `primaryAlpha10`, `primaryAlpha20` and equivalent for secondary. These enable consistent tinted backgrounds without manual rgba calculations in every component.

### What's missing from the theme

1. **No dark-mode toggle.** The theme assumes dark mode always. The `ColorScheme` type supports 'light' and 'dark', the `colors()` function switches on scheme, light palette values are defined — but `useTheme` always returns dark. Fine for now (the product is dark-mode-first), but the infrastructure for light mode is ready when needed.

2. **No typography variants in the theme.** The Text component defines variants (heading, title, body, label, caption, overline), but the theme only exports raw sizes, weights, and line heights. A `textStyles` object in the theme that pre-computes the six variant styles would allow non-Text consumers (like third-party components) to match the type scale.

3. **No transition easing tokens.** The animation durations are defined, but easing curves are not. Every Animated.timing call uses the default easing or no easing specification. Two named curves (standard ease-out, emphasis spring) would unify the motion feel.

---

## 6. Platform convention compliance

### Touch targets — systematic audit

| Element | Measured size | Minimum (HIG) | Pass? |
|---|---|---|---|
| Button `size="lg"` | 52pt min-height | 44pt | Yes |
| Button `size="md"` | 44pt min-height | 44pt | Yes |
| Button `size="sm"` | 32pt min-height | 44pt | **FAIL** |
| ChatInput send button | 32x32pt | 44pt | **FAIL** |
| CollapsibleSection header | ~24-28pt | 44pt | **FAIL** |
| TaskCard status badge (tap to open picker) | ~26pt | 44pt | **FAIL** |
| Tab bar icons | 22pt icon + 10pt label + padding ≈ 48pt | 44pt | Yes |
| Category pills (check-in) | ~36-40pt | 44pt | **Borderline** |
| Onboarding "Skip" text | 11pt text + padding = ~24pt | 44pt | **FAIL** |
| NavRow in Settings | Row height ~48pt | 44pt | Yes |

**Five elements fail touch target compliance.** Button `sm`, ChatInput send, CollapsibleSection header, TaskCard status badge, and onboarding Skip. These need immediate attention.

### Gestures

**Zero custom gesture implementations in the entire codebase.** No swipe gestures, no long-press contextual menus, no drag-to-reorder, no pinch. Every interaction is a tap. This is the single largest gap between the current app and a native-feeling experience.

Priority gesture additions:
1. **Swipe-to-complete on TaskCard** — the most frequent positive action in the app
2. **Long-press on TaskCard** — contextual menu with status options, check-in, tools
3. **Swipe-back gesture** — expo-router's Stack provides this by default on iOS, verify it's not disabled

### Haptic feedback

**Excellent coverage.** Every button fires `ImpactFeedbackStyle.Light`. Status changes fire `selectionAsync()`. Successful API completions fire `NotificationFeedbackType.Success`. Errors fire `NotificationFeedbackType.Error`. Fork selection uses `ImpactFeedbackStyle.Medium` (heavier). Sign-out confirmation uses the Alert API which provides its own haptics.

This is **one of the app's genuine strengths.** The haptic vocabulary is consistent and intentional. Preserve it and extend it: add `ImpactFeedbackStyle.Heavy` for fork confirmation after the API returns, and a custom haptic pattern for recommendation reveal (a brief double-tap sensation that communicates "here's something special").

### Safe areas

All screens use `ScreenContainer` which applies `paddingTop: insets.top` and `paddingBottom: insets.bottom` via `useSafeAreaInsets`. The tab bar adds `paddingBottom: insets.bottom > 0 ? insets.bottom : spacing[2]`. The ChatInput adds `paddingBottom: Math.max(insets.bottom, spacing[2])`. Status bar style is set to 'light' in dark mode. **No safe area issues identified.**

### Keyboard handling

KeyboardAvoidingView is used on the discovery chat and the check-in screen. Platform-specific `behavior` (padding on iOS, height on Android). The `keyboardVerticalOffset` is hardcoded to 90 on iOS — this should be measured from the navigation header height rather than hardcoded, but 90pt works for the standard Stack header. `keyboardShouldPersistTaps="handled"` is correctly set on ScrollViews to prevent keyboard dismissal on tap.

**Missing:** No `Keyboard.dismiss()` call when tapping outside the input area. When the keyboard is up and the user taps a non-interactive area of the chat (e.g., an older message), the keyboard stays open. It should dismiss. Add a `Pressable` wrapper around the message list with `onPress={Keyboard.dismiss}`.

### Pull-to-refresh

Present on: Roadmap tab, Sessions tab. Not present on: Tools tab (static list, appropriate), Recommendation screen (SWR auto-revalidates on focus), Continuation screen (polling-based). Coverage is correct.

---

## 7. Ranked priority list

1. **Fix touch target violations.**
   - Problem: Five interactive elements (Button sm, send button, collapsible header, status badge, skip text) are below the 44pt minimum.
   - Fix: Button `sm` minHeight → 40pt with 44pt hit slop. Send button → 44x44pt with 36pt visible circle. Collapsible header → 44pt paddingVertical. Status badge → hitSlop prop or larger padding. Skip text → larger tap area via padding.
   - Impact: Eliminates the most common source of user frustration on touch devices.
   - Effort: Small (1-2 days).

2. **Replace text characters with proper icons.**
   - Problem: Send button uses '↑', CollapsibleSection uses '▼'. These are the two most common interactive affordances in the app and they look like placeholder art.
   - Fix: Lucide `ArrowUp` for send, `ChevronDown` for collapsible. Both already installed.
   - Impact: The app immediately feels less like a prototype.
   - Effort: Trivial (2 hours).

3. **Add a BottomSheet primitive and migrate TaskStatusPicker.**
   - Problem: The inline dropdown picker works but causes layout shifts and is not the platform convention.
   - Fix: Implement a BottomSheet (Gorhom or custom Animated). Migrate TaskStatusPicker to present in a sheet. Use the same sheet for tool launcher, confirmation dialogs.
   - Impact: The most-interacted-with control in the app feels native.
   - Effort: Medium (3-4 days for primitive + migration).

4. **Elevate the fork picker.**
   - Problem: Fork cards look identical to parking lot cards. No gold accent. No animation on selection.
   - Fix: Gold overline ("The decision"), gold border on selected fork, scale-down animation on unselected forks, expansion + success state on selected fork before navigation, reorder to put forks above the closing reflection.
   - Impact: The emotional crescendo of the product actually lands.
   - Effort: Small (2-3 days).

5. **Fix the recommendation reveal for mobile.**
   - Problem: Seven open collapsible sections produce ten screen-lengths of scroll. Summary card is too subtle. Falsification uses italic.
   - Fix: Default only summary + path + first three steps to open. Collapse the rest. Gold border on summary card. Drop italic on falsification statement. Bump summary text to `variant="title"`.
   - Impact: The recommendation payoff moment becomes scannable instead of overwhelming.
   - Effort: Small (1-2 days).

6. **Add scroll-to-bottom FAB to chat interfaces.**
   - Problem: Auto-scroll yanks the user to the bottom even when they're reading history. No way to manually scroll to latest.
   - Fix: Track scroll position via `onScroll`. When user scrolls up more than one screen height, show a floating "↓" button anchored above the input. Auto-scroll only when user is already at the bottom.
   - Impact: Every chat surface (discovery, pushback, coach roleplay, diagnostic) becomes usable for longer conversations.
   - Effort: Small (1-2 days).

7. **Bump chat bubble text to 15px.**
   - Problem: 13px body text in chat bubbles is too small for arm's-length phone reading.
   - Fix: Change ChatBubble font size from `typography.size.sm` to `typography.size.base`.
   - Impact: Immediate readability improvement across every chat surface.
   - Effort: Trivial (30 minutes).

8. **Add swipe-to-complete gesture on TaskCard.**
   - Problem: Zero gesture support anywhere in the app. Completing a task requires: tap status badge → tap "Completed" in picker (or tap Check-in → select Completed → tap Submit). Two taps minimum.
   - Fix: react-native-gesture-handler Swipeable or custom PanGestureHandler. Right-swipe reveals a green "Complete" action with a checkmark icon. Fires the same status PATCH.
   - Impact: The most frequent positive action in the app becomes a single gesture.
   - Effort: Medium (3-4 days including gesture handler setup).

9. **Improve the task completion moment.**
   - Problem: Completing a task via check-in shows a blue "Step complete" card. No special color, no special animation.
   - Fix: Success green card (not primary blue). Scale-up animation on the "Step complete" text. SuccessNotification haptic (already present) combined with a brief celebratory visual — even just a checkmark icon that scales in.
   - Impact: The single most positive emotional moment in the daily loop feels rewarding.
   - Effort: Small (1-2 days).

10. **Fix the first-run experience on the Roadmap tab.**
    - Problem: New users see an empty state that redirects to Sessions tab. Two screens and two taps before the first meaningful interaction.
    - Fix: When `roadmaps.length === 0`, render the discovery CTA inline on the Roadmap tab instead of an EmptyState pointing elsewhere.
    - Impact: First-run friction drops. The app feels like it knows the user is new.
    - Effort: Small (half day).

11. **Add request timeout and retry to the API client.**
    - Problem: `api-client.ts` uses bare `fetch` with no timeout. On 3G, requests can hang indefinitely.
    - Fix: Add an `AbortController` with a 30-second timeout. Add exponential backoff retry (2 attempts) for 5xx errors. Add network state detection via `@react-native-community/netinfo`.
    - Impact: The app stops feeling broken on slow connections.
    - Effort: Small-medium (2-3 days).

12. **Add shared element transitions between key screens.**
    - Problem: All screen transitions use the default Stack push animation.
    - Fix: expo-router supports shared element transitions via the `sharedTransitionTag` prop. Add it to: recommendation summary → roadmap header (the recommendation text travels), fork card → next recommendation, task card → check-in header.
    - Impact: The app feels spatially coherent — elements travel between screens instead of appearing from the right edge.
    - Effort: Medium (3-5 days).

13. **Split oversized screen files.**
    - Problem: `packager.tsx` (730 lines) and `research.tsx` (723 lines) significantly exceed the 300-line limit.
    - Fix: Extract finding cards, plan display, and result rendering into separate components.
    - Impact: Maintainability. No user-facing change, but prevents the files from becoming unreviewable.
    - Effort: Small (1-2 days).

14. **Add height animation to CollapsibleSection.**
    - Problem: Content appears/disappears instantly (`{open && children}`). No animated height transition.
    - Fix: Use `LayoutAnimation.configureNext()` before the state change, or measure content height with `onLayout` and animate with `Animated.Value`.
    - Impact: Collapsible sections feel physical rather than toggled. Every recommendation section, every preparation section, every check-in history benefits.
    - Effort: Small-medium (2 days).

15. **Differentiate coach roleplay bubbles.**
    - Problem: Roleplay uses the same ChatBubble as the discovery interview. The founder can't visually distinguish "answering real questions" from "practicing a conversation."
    - Fix: Different assistant bubble color for roleplay (muted gold? muted warm tone?), "In character" label on the other party's messages, or a subtle background color shift for the entire roleplay phase.
    - Impact: The coach's most valuable phase becomes visually distinct.
    - Effort: Small (1 day).

---

## 8. What the mobile app already does well

These are genuine strengths that must be preserved through every iteration. They represent taste decisions that are hard to make and easy to lose.

- **Haptic vocabulary.** Light impact for navigation, selection for state changes, success/error notifications for API results, medium impact for the fork decision. This is the most thoughtfully implemented haptic system I've seen in an early-stage React Native app. It gives the entire product a tactile quality that partially compensates for the visual gaps.

- **The theme system.** Animation tokens, icon size scale, scheme-aware shadows, alpha variants for brand colors. This is ahead of the web design system and provides a foundation that most React Native apps never build. Every subsequent improvement will be faster because the tokens exist.

- **The ProgressHeader.** Compact, information-dense, shows everything the founder needs at a glance. The web review asked for exactly this and the mobile app has it.

- **The TaskStatusPicker pattern.** Tapping a Badge to reveal inline options is a better mobile pattern than a native `<select>`. It's not as good as a bottom sheet (see Priority 3), but it's the right instinct.

- **Pull-to-refresh on the right screens.** Roadmap and Sessions support pull-to-refresh. Tools and Settings don't (correct — they're static). The coverage is intentional, not blanket.

- **The onboarding voice.** "You know something needs to change." lands on mobile the same way the web copy does. The restraint of four slides (not seven, not ten) is the right call. The gold-accented recommendation callout on slide 2 is a real design moment.

- **Safe area handling everywhere.** No clipping under the notch, no content behind the home indicator, status bar style responds to theme. This sounds basic but a significant percentage of React Native apps in production get it wrong.

- **SWR + optimistic updates.** Data fetching uses SWR with `revalidateOnFocus: true`, which means returning to the app after backgrounding automatically refreshes stale data. Optimistic status changes on TaskCard with rollback on error. The data layer is production-quality.

- **Secure token storage.** expo-secure-store for the auth token, in-memory cache for performance, Bearer header attachment on every request. The auth service uses Zustand with a clean three-method interface (hydrate, signIn, signOut). The push token registration fires as fire-and-forget on sign-in and hydrate. The sign-out flow unregisters the push token before clearing the auth token. These are details that prevent silent bugs.

---

## 9. References and inspiration

Specific mobile apps, specific screens, specific things to study. Not "look at good apps."

- **Things 3 (task management)** — Study the swipe gesture on a task item. The swipe reveals a set of action icons with spring physics — the icons bounce slightly as they appear. The completion animation (a satisfying circle fill) makes checking off a task feel like an achievement. NeuraLaunch's TaskCard should study this for swipe-to-complete and completion moments.

- **Claude iOS (Anthropic)** — The closest functional cousin. Study specifically: (1) the chat input area — send button size, microphone button placement, multi-line expansion behavior; (2) the scroll-to-bottom FAB that appears when scrolled away from the latest message; (3) how the thinking indicator is positioned relative to the input bar (overlay, not inline). NeuraLaunch's discovery chat should mirror these patterns.

- **Linear Mobile** — Study the issue detail screen. It shows a task title, a status badge, an assignee, and then the description — all above the fold on most phones. Below the fold: activity, comments, sub-issues. The information hierarchy is ruthless about what matters first. NeuraLaunch's TaskCard should study this for its content ordering: title + status first, description second, actions third, history last.

- **Apollo (Reddit client, by Christian Selig)** — The gold standard for gesture design in a content-dense mobile app. Study the swipe actions on a comment (left-swipe for upvote, right-swipe for reply), the contextual menus on long-press, and the haptic feedback on each gesture threshold. The gesture vocabulary gives a 400-screen app the speed of a calculator app.

- **Superhuman** — Study the transition speed. Every screen change feels instant because shared element transitions carry context from one screen to the next. No "blank screen → content pops in" pattern. NeuraLaunch's recommendation-to-roadmap transition should study this.

- **Notion Mobile** — Study how a complex desktop tool handles progressive disclosure on mobile. The page editor shows the title and the first few blocks. Everything else is below the fold. Notion doesn't try to show everything at once — it trusts that the user will scroll. NeuraLaunch's recommendation reveal (seven open sections) should study this restraint.

- **Arc Search** — Study the confidence of the animation language. Every interaction has a distinct animation signature — the search bar slides, the results panel expands, the AI summary fades in with a slight delay. Arc doesn't have many animations, but each one has a specific purpose. NeuraLaunch should study this for its collapsible sections and its state transitions.

- **Spark Mail** — Study the bottom sheet pattern. Every secondary action (move to folder, snooze, label) opens in a bottom sheet from the thumb zone. The sheet has a handle, a drag-to-dismiss gesture, and spring physics on the snap points. NeuraLaunch's TaskStatusPicker, tool launcher, and fork picker should study this.

---

## 10. Cross-platform consistency assessment

### Where mobile matches web

| Area | Status | Notes |
|---|---|---|
| Color palette | Aligned | Primary, secondary, success, destructive, warning all match |
| Flow sequence | Aligned | Interview → recommendation → roadmap → tools → continuation on both platforms |
| Data model | Shared | Mobile consumes the same API endpoints, same Zod types via @neuralaunch/api-types |
| Recommendation structure | Aligned | Same seven sections, same collapsible pattern |
| Tool suite | Aligned | All four tools present on both platforms with same phases |
| Auth providers | Aligned | Google + GitHub on both, mobile uses token bridge |
| Haptic for brand | Mobile-only | Mobile has haptic vocabulary that web cannot replicate — this is a mobile advantage |
| Push notifications | Mobile-only | Nudge pushes for stale tasks — extends the web's nudge banner pattern |

### Where mobile intentionally diverges from web (good divergences)

| Area | Web | Mobile | Assessment |
|---|---|---|---|
| Navigation | Sidebar with chat history | Bottom tabs (Roadmap/Sessions/Tools/Settings) | Correct — sidebar is for pointer devices, tabs are for thumbs |
| Status picker | Native `<select>` | Tappable Badge → inline picker | Better on mobile — the Badge interaction is more intuitive than a dropdown |
| Tool routing | Page routes (/tools/coach) | State machine within single screen | Correct — mobile should minimize screen transitions for multi-step flows |
| Progress indicator | None (web review requested one) | ProgressHeader with bar | Mobile is ahead — the web should match |
| Session resumption | Inline on /discovery | Dedicated prompt screen | Correct — mobile needs the context spelled out since the user may have been away for hours |

### Where mobile diverges from web (problematic divergences)

| Area | Web | Mobile | Problem |
|---|---|---|---|
| Recommendation summary card | Gold-bordered | Blue (primary variant) | Gold is the moment color. Mobile should match web's gold treatment. |
| Recommendation text | Collapsibles default closed | All seven collapsibles default open | Mobile screen is half the width — open-by-default produces extreme scroll |
| Chat text size | ~14px (text-sm on web) | 13px | Web is already small; mobile is smaller at a greater reading distance |
| Fork picker emphasis | Identical to parking lot (web bug) | Identical to parking lot (same bug) | Mobile inherits the web's worst UX failure instead of fixing it |
| Falsification italic | Italic (web bug) | Italic (same bug) | Mobile inherits the web's typography error |
| Input primitive | No Input primitive (web bug) | TextInput exists but no multiline | Mobile has a primitive the web lacks, but it's incomplete |

### Where mobile should differentiate but doesn't

1. **Gesture vocabulary.** Mobile's fundamental interaction medium is touch, not click. The app uses taps exclusively. Every premium mobile app adds swipe and long-press to the vocabulary. NeuraLaunch doesn't.

2. **Motion language.** Mobile apps can use spring physics, shared element transitions, and layout animations to create spatial continuity. NeuraLaunch uses opacity fades and instant show/hide. The animation tokens exist in the theme (150/250/400ms) but are barely used.

3. **Notification-driven re-engagement.** The push notification infrastructure is in place (push.ts, notifications.ts). The nudge cron on the backend fires daily. But the notification tap only deep-links to the roadmap. It should deep-link to the specific stale task within the roadmap, pre-selecting the check-in action.

---

*Review prepared 2026-04-17. Start with priorities 1-2 (touch targets + icon replacements) — they take two days and eliminate the most visible quality gap. Priority 3 (BottomSheet) and Priority 4 (fork picker) are the highest-leverage medium-effort investments. Together, these four priorities move the app from "runs on a phone" to "belongs on a phone."*
