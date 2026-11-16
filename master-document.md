## 1. Project purpose

ecom-v1 is a portfolio-scale, marketplace-lite e-commerce application. Its purpose is to demonstrate the ability to design, build, test, deploy, operate and explain a complete software product.

The project should result in a credible, usable application with coherent customer and merchant journeys, a reliable backend and persistent database, appropriate security and data-integrity controls, automated tests, repeatable deployment, useful operational visibility and clear engineering documentation.

The project prioritises practical engineering judgement and demonstrable end-to-end behaviour. It is not intended to become an enterprise marketplace, a distributed-systems exercise by default, or a collection of unrelated technology demonstrations.

## 2. Product overview

The application is a marketplace-lite platform where independent merchants offer products through a shared storefront. It has three principal user groups:

- **Customers** discover products, maintain an account and complete the supported purchase journey.
- **Merchants** onboard themselves, operate their own store, manage their catalogue and inventory, and manage orders relevant to their store.
- **Platform administrators** perform the minimum central operations needed to manage and oversee the marketplace.

A person may use the application as a customer and later activate merchant capabilities. Merchant onboarding is self-service; a manual administrator approval queue is not part of the intended initial experience. A merchant must not be able to access or modify another merchant's private resources. Administrator privileges are separate from ordinary customer and merchant capabilities.

### Initial product capabilities

**Customer experience**

- Registration and sign-in through Clerk, with a personal display name required during registration.
- Public storefront, product catalogue, product details and basic product discovery.
- Basic search, sorting and filtering where they support the initial catalogue. Fuzzy search is deferred, not abandoned.
- Persistent cart for authenticated customers only. Guest carts and cart merging are excluded from the initial release.
- Checkout using simulated payment only.
- Customer order confirmation, history and order details.

**Merchant experience**

- Self-service merchant onboarding without manual approval.
- Store profile and basic store management.
- Create, edit, publish and archive simple products.
- Product images supplied through validated external image URLs; merchant image uploads and a dedicated image-storage platform are not part of the initial scope.
- Basic inventory management for the merchant's own products.
- A consolidated seller-facing order-management experience for orders relevant to the merchant's store, with permissions and allowed actions enforced by the backend.

**Platform administration**

- The minimum administrator experience required for central marketplace operations, including appropriate management and oversight of users, merchants, catalogue configuration and order operations.
- Privileged actions must be protected and distinguishable from ordinary customer and merchant actions.
- Do not expand this into a large enterprise administration, moderation or trust-and-safety platform without an explicit scope decision.

### Product and commerce boundaries

- Keep the product model simple: no product variants or elaborate configurable product systems in the initial release.
- The cart is authenticated and persistent. Adding an item to the cart does not itself reserve inventory. Current product, merchant, price and availability information must be checked again at relevant purchase boundaries.
- Checkout totals and purchase-critical decisions must be derived and validated by the backend, not trusted from browser-submitted values.
- Orders should retain the purchase-time information needed to explain what was bought and at what price.
- The payment integration is a deterministic mock service. It must never collect, store or log real card data or represent simulated outcomes as real payment processing.
- The mock-payment demonstration must make these outcomes repeatable and understandable: successful payment; known payment failure; payment succeeds but the response is lost; and payment service unavailable. The interface and logs must distinguish an unknown outcome from a confirmed failure.
- Keep order states, cancellation and inventory behaviour to the minimum needed for a correct and demonstrable marketplace. GSD must identify business decisions that require owner input rather than silently inventing them.

## 3. Project stages and terminology

The project has five sequential stages. **Stages 1 and 2 are mandatory. Stages 3, 4 and 5 are optional extensions.** The project is considered complete when Stage 2 is delivered; optional stages are not prerequisites for completion.

The word **Stage** refers to the project's long-term deliverables in this document. The word **GSD phase** refers to an implementation-sized unit created and managed by GSD Core in the repository. These are different numbering systems and must not be conflated.

### Stage 1 — Complete Monolith

**Status: Mandatory**

**Outcome:** A complete, working, deployed full-stack marketplace application. Every required application layer exists and works together. Stage 1 must be independently usable and demonstrable; it is not merely a backend foundation or a collection of disconnected features.

The monolith consists of one primary web application, one NestJS API application and one primary PostgreSQL database. Build customer, merchant and administrator capabilities as parts of the same product rather than as separately deployed services.

Stage 1 includes:

- The agreed customer, merchant and platform-administration journeys.
- Clerk-based identity authentication and application-owned authorization.
- Product catalogue and basic discovery.
- Authenticated persistent customer cart.
- Checkout and deterministic mock-payment scenarios.
- Inventory and order workflows, including seller-facing order management.
- Server-side validation, resource ownership enforcement and essential data-integrity protections.
- Automated tests for important business rules, API behaviour and end-to-end journeys.
- Local development using Docker and Docker Compose where practical.
- A repeatable CI/CD pipeline.
- Structured application logging using Pino, health visibility and a useful local/demo operational workflow.
- **Better Stack:** Preferred hosted observability candidate for centralized log ingestion and uptime monitoring. Its current personal-project free tier advertises 3 GB of logs retained for 3 days and up to 10 monitors/heartbeats. Use it only within the included quota and configure a zero-spend limit; do not enable paid overages. If the account cannot enforce a zero-spend boundary, retain Pino/local observability and omit the hosted integration.
- API documentation using an OpenAPI-based contract.
- Engineering documentation, including a Starlight documentation site and the relevant setup, architecture and decision explanations.
- A deployed frontend and backend with persistent data, subject to the zero-spend constraint.
- Seed/demo data and a reviewer-friendly way to exercise the important application journeys.

Storybook is **not** a Stage 1 requirement. It is deferred and may be reconsidered later if it provides clear value.

**Completion evidence:** A reviewer can access the deployed application, exercise the supported customer and merchant journeys, observe the simulated payment outcomes, and inspect the tests, deployment pipeline, API documentation and engineering explanations. The owner can explain the important implementation choices and limitations.

### Stage 2 — Hardened Monolith

**Status: Mandatory**

**Outcome:** Measure the working application under controlled, production-like workloads, identify real weaknesses and make justified improvements. Stage 2 adds no major user-facing product features; it makes the existing system more measurable, reliable and efficient.

Stage 2 includes:

- Expanded deterministic synthetic data, with workload sizes chosen to reveal meaningful database and application behaviour. The original ecom-v0 proposal of approximately 50,000 products and 10,000 users is a reference target to evaluate, not an unconditional acceptance criterion.
- Reproducible k6 load-test scenarios for representative browsing, search, cart and checkout activity.
- A documented baseline before optimization.
- Use Better Stack's hosted logs and uptime data where available to correlate application behaviour with the load-test baseline and diagnosis. Keep the load generator and performance measurements independent of the monitoring vendor.
- Evidence-led diagnosis of actual bottlenecks, such as inefficient queries, N+1 access patterns, missing or unsuitable indexes, connection-pool pressure and avoidable application work.
- Targeted changes only where measurements justify them: query restructuring, indexing, connection configuration, caching or other relevant improvements.
- Repeated tests under comparable conditions and a clear before/after comparison.
- Honest reporting of test environment, workload, limitations and results. Synthetic load tests must not be presented as proof of production-scale capacity.

**Completion evidence:** The project contains repeatable test scenarios, baseline and post-change measurements, an explanation of the bottlenecks found, the fixes made, and evidence showing their effect. Improvements must be based on observed behaviour, not a checklist of speculative optimizations.

### Stage 3 — Microservices

**Status: Optional**

**Outcome:** Deliberately decompose the proven monolith into independently deployable services and demonstrate the architectural trade-offs.

Potential scope includes service boundaries around catalogue, orders and other justified domains; an API gateway where appropriate; asynchronous messaging for workflows that need it; independent deployment and service-specific data ownership.

Clerk remains the external identity provider unless a later, explicit decision changes that boundary. Do not recreate a custom authentication service merely to fill a microservices diagram.

This stage should investigate distributed transaction boundaries, eventual consistency, retries, idempotency, service failure and data ownership. It is a deliberate architecture exercise, not a prerequisite for the monolith to be considered successful. Hosting, messaging and database choices must be re-evaluated against the zero-spend constraint before adoption.

### Stage 4 — Mobile Client

**Status: Optional**

**Outcome:** Demonstrate that the application API can support a native mobile client in addition to the web client.

The likely scope is a customer-facing React Native application using Expo: authentication, catalogue browsing, product details, cart, checkout and order history. Seller and administrator tools remain on the web application unless a compelling requirement is established.

Stage 4 must remain optional independently of Stage 3. If microservices have not been built, the mobile client should be able to consume the monolith's supported API. If Stage 3 has been completed, it may use the gateway. Mobile work must not make microservices a hidden prerequisite.

### Stage 5 — Production Microservices and Advanced Operations

**Status: Optional; depends on Stage 3**

**Outcome:** Improve the operational maturity of a microservices deployment.

Potential work includes distributed tracing, centralized service logs, per-service health monitoring and alerting, gateway hardening, and independent deployment visibility. Kubernetes is not an assumed requirement; consider it only if there is a specific learning or demonstration objective that justifies the additional scope and cost.

### Optional AI extension

A small, self-contained AI capability may be considered after the mandatory stages are complete and stable. It must have a clear product or demonstration purpose, must not compromise the core architecture, and must not delay Stage 1 or Stage 2. It is not part of the mandatory project scope.

## 4. Technology direction

The following choices represent the current project direction. GSD should verify current versions, compatibility, licensing, provider limits and implementation details when it researches the project. It may recommend changes, but must not silently override an accepted direction or a non-negotiable constraint.

### Main application

- **Language:** TypeScript.
- **Frontend:** Next.js 16 with React.
- **Backend:** NestJS 12.
- **Architecture:** A monorepo containing the web application, API and only justified shared packages.
- **Database:** PostgreSQL.
- **Identity provider:** Clerk. Do not build custom password authentication, custom JWT issuance or a bespoke refresh-token system.
- **Backend authorization:** Application roles, capabilities and resource ownership are enforced by the NestJS backend. A frontend route guard is not a security boundary.
- **API contract:** OpenAPI, with a clear source of truth for the API contract and generated client code where appropriate.
- **Logging:** Pino structured application logs.

### Development tooling and quality

- **Unified project toolchain:** Vite+. It replaces the previous separate Biome and Lefthook direction for the supported formatting, linting, testing orchestration and Git-hook workflows.
- Do not add overlapping tools for responsibilities already handled by Vite+ without a concrete reason.
- Vite+ does not replace Next.js or NestJS application build systems; preserve framework-native build and deployment requirements.
- **Testing:** Use suitable unit, integration, API and browser end-to-end tests. Vitest, Supertest, React Testing Library and Playwright are the current preferred directions, subject to GSD verifying the fit with the selected project setup.
- **Local environment:** Docker and Docker Compose for reproducible local services.
- **CI/CD:** GitHub Actions is the current direction, subject to current quota and billing verification.
- **Codebase mapping:** Introduce Graphify early enough to help explain the codebase, and automate updates where practical without creating excessive tool overhead.

### Documentation

- Use Starlight for the project documentation site.
- Keep root agent instructions concise and link to the relevant documentation.
- Document setup, architecture, API behaviour, important decisions, conventions and operational procedures.
- Keep Git conventions, including worktree guidance, in repository-facing engineering documentation.
- Storybook is deferred; it is not a prerequisite for Stage 1 or Stage 2.

### Hosting and cost

- **Frontend:** Vercel is the current deployment direction. Use a provider-generated hostname rather than buying a custom domain for this project.
- **Backend:** Hosting provider not yet selected. Do not assume Render. GSD should research a viable option that meets the cost and operational constraints.
- **Database:** Use PostgreSQL. The hosted provider is not locked until its current limits, suspension behaviour and billing model are checked.
- **Zero-spend constraint:** The project must not depend on paid subscriptions, a paid custom domain, unavoidable usage charges, automatic paid overages or a service that can incur charges without explicit owner approval. Verify current provider terms and limits before adoption. Maintain a practical local/demo fallback if a suitable hosted free tier is unavailable.
- **Better Stack:** Preferred, conditional hosted observability for Stage 1 logs and uptime, and Stage 2 diagnostic context. The current public pricing page advertises a free personal-project tier, but logs/traces have a 3 GB included allowance and 3-day retention; published over-quota ingestion is billable. The integration is permitted only if a zero-spend cap can be configured and verified. Otherwise, do not send logs to Better Stack and use local observability. Pino structured logs remain mandatory in either case.

## 5. Engineering principles and constraints

- **Practical monolith first:** Stages 1 and 2 use a modular monolith. Do not add microservices, distributed infrastructure, Kubernetes, a message broker or extra deployment layers without a justified optional-stage objective.
- **Subsystem sequencing:** Implement Stage 1 in the order **backend → frontend → integration → deployment**. Do not use feature-by-feature vertical slices. The backend is implemented as a coherent, tested subsystem before substantial frontend work begins; frontend work then builds against the established backend contracts and generated API client. Backend planning must still model the intended customer and merchant journeys so that its API contracts properly serve their consumers. Each subsystem is tested during its own implementation; end-to-end journey verification follows after both are implemented. *(Revised 2026-11-16 from an earlier vertical-slice direction, by owner decision; GSD may plan both subsystems in advance but must respect this order.)*
- **Correctness before sophistication:** Protect identity, authorization, ownership, inventory, payment outcome and order invariants. Prefer a small correct workflow over a large collection of unfinished features.
- **Backend authority:** Enforce authentication, authorization, input validation, ownership and purchase-critical calculations on the server.
- **Safe failure behaviour:** Do not interpret a timeout or lost response as proof that a payment failed. Make simulated outcomes repeatable and observable.
- **No speculative scale:** Stage 2 measures and improves the system based on evidence. Do not design the initial monolith for imaginary traffic.
- **No silent scope expansion:** Deferred features remain deferred unless the owner explicitly accepts a change.
- **Owner-controlled consequential decisions:** GSD and coding agents may research, recommend defaults and implement accepted work. They must request owner input before changing product behaviour, security boundaries, accepted constraints, major architecture direction or budget exposure.
- **Efficient AI-assisted workflow:** Minimize duplicated planning, repeated research and unnecessary context overhead. Use mature packages pragmatically; do not create compatibility experiments or elaborate tooling projects without a demonstrated need.

## 6. GSD Core handoff and ownership

This master document is the project-level brief and stage definition. It is the context to refine and later hand to GSD Core; it is not a replacement for GSD's implementation planning.

After the owner approves the master document, GSD Core should:

- Conduct interactive discovery against the project goal, requirements and constraints.
- Research current technology and provider options before making recommendations.
- Identify missing requirements, contradictions, risks and dependencies.
- Develop domain models, architecture, database design, API contracts, testing strategy and implementation roadmap as needed.
- Recommend sensible defaults for routine or reversible technical decisions.
- Ask the owner about material product, security, budget or architectural decisions, presenting a recommendation and its reasoning rather than asking open-ended questions without analysis.
- Plan and execute the mandatory stages incrementally, verifying each implementation unit before proceeding.
- Maintain implementation plans, execution state, verification evidence and repository-facing technical documentation in the repository.

Notion should retain the approved project brief and meaningful owner decisions. It should not duplicate GSD's task tracker, phase plans, execution state, API specifications, detailed diagrams, code documentation or operational evidence. Those belong in the repository.

## 7. Discovery items for GSD

The master document intentionally does not pre-model the entire system. During discovery, GSD must identify which of the following need an owner decision and which can be handled through a researched technical default:

- Exact role/capability boundaries and administrator bootstrap.
- Clerk-to-local-user provisioning, account deletion and lifecycle synchronization.
- Product publication, category configuration and moderation rules for user-provided content.
- Inventory adjustment and checkout reservation behaviour.
- Mock-payment attempt handling, idempotency, unknown outcomes and recovery.
- Order lifecycle, seller/admin action boundaries and customer cancellation.
- Shipping and final-total rules.
- Personal-data retention and order-history treatment.
- Backend and database hosting that meet the zero-spend constraint.

These are discovery topics, not permission to expand the initial release into an elaborate system. Resolve each only to the depth required to implement and verify the agreed Stage 1 behaviour safely.

## 8. Project completion criteria

The mandatory project is complete when both conditions below are met.

**Stage 1 delivered:** The deployed monolith provides the agreed customer and merchant journeys, persistent data, Clerk identity, backend-enforced authorization, catalogue, authenticated cart, checkout, simulated payment, order workflows, automated quality checks, Pino logs, API and engineering documentation, and repeatable deployment. Better Stack hosted logs and uptime monitoring are included only when the zero-spend cap has been verified; otherwise local observability satisfies this requirement.

**Stage 2 delivered:** The monolith has been tested under documented synthetic workloads; meaningful bottlenecks have been investigated; justified improvements have been made; and before/after evidence and limitations have been recorded.

Stages 3–5 and the AI extension are optional. Their absence does not make ecom-v1 incomplete.

## 9. Change control

This document is refined collaboratively with the owner. Distinguish confirmed requirements from proposals, defaults and unresolved questions. When a consequential decision changes, record what changed and why. Do not silently promote an assumption into an accepted requirement.

The master document should remain focused on product intent, project-wide constraints, technology direction and stage outcomes. Detailed implementation design belongs with GSD and the repository.
