---
name: Institutional Intelligence
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424754'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#0059c6'
  primary: '#004cab'
  on-primary: '#ffffff'
  primary-container: '#0963d8'
  on-primary-container: '#e2e8ff'
  inverse-primary: '#afc6ff'
  secondary: '#545c83'
  on-secondary: '#ffffff'
  secondary-container: '#cad2ff'
  on-secondary-container: '#515980'
  tertiary: '#3a3ac8'
  on-tertiary: '#ffffff'
  tertiary-container: '#5456e1'
  on-tertiary-container: '#e9e6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#FEE2E2'
  on-error-container: '#93000a'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#afc6ff'
  on-primary-fixed: '#001a43'
  on-primary-fixed-variant: '#004398'
  secondary-fixed: '#dde1ff'
  secondary-fixed-dim: '#bcc4f1'
  on-secondary-fixed: '#10193c'
  on-secondary-fixed-variant: '#3d456a'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
  surface-canvas: '#F8FAFC'
  surface-card: '#FFFFFF'
  border-subtle: '#E2E8F0'
  status-success: '#10B981'
  status-warning: '#F59E0B'
  status-error: '#EF4444'
  success-container: '#D1FAE5'
  warning-container: '#FEF3C7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  helper-text:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  sidebar-width: 256px
  topbar-height: 64px
---

## Brand & Style

The brand personality is authoritative, organized, and meticulously structured. It is designed to evoke a sense of deep institutional trust and administrative calm, transforming complex multi-tenant data into clear, actionable insights. The target audience includes school administrators, educators, and parents who require a dependable environment for high-stakes educational management.

The design system follows a **Corporate / Modern** aesthetic with elements of **Minimalism**. It prioritizes a "software-as-an-infrastructure" feel—reliable and invisible when it needs to be, but vibrant and helpful during interaction. The interface utilizes a high-density information strategy balanced by a generous 4px baseline grid and a sophisticated "chrome" hierarchy that distinguishes navigation from workspace.

## Colors

The palette is anchored by **Academic Royal Blue** (Primary), used for critical actions and interactive states, and **Midnight Navy** (Secondary), which provides the structural authority for navigation and headers.

- **Primary & Secondary:** The interaction between the vibrant primary blue and the deep navy sidebar creates a professional "Command Center" atmosphere.
- **Surface Strategy:** We use a tiered neutral system. The main application background is a soft slate (`#F8FAFC`), while interactive data containers and cards are pure white (`#FFFFFF`) to create clear visual separation.
- **Semantic Statuses:** Educational outcomes (Pass/Fail/Pending) are color-coded using a standard traffic-light system with high-contrast background tints to ensure data remains scannable at a glance.

## Typography

This design system utilizes **Inter** as its primary typeface for its exceptional legibility in data-heavy environments and its neutral, modern character.

- **Data Density:** Body copy is set at 14px to allow for high-density tables without sacrificing readability. 
- **Hierarchy:** Display and Headline levels use tighter letter-spacing to maintain a "firm" institutional look.
- **Multilingual Support:** While the primary Latin font is Inter, all Bengali script content must fall back to **Noto Sans Bengali**, maintaining the same weight and line-height ratios as the Latin counterpart.
- **Captions:** Use `label-caps` (all-caps with letter spacing) specifically for table headers and metadata labels to distinguish them from editable data.

## Layout & Spacing

The system employs a **Fixed Shell / Fluid Content** grid model.

- **The Shell:** A fixed 256px sidebar (Midnight Navy) houses the primary navigation. This is paired with a sticky 64px top bar for global search and profile management.
- **The Workspace:** Content resides in a fluid container that caps at 1280px (`max-w-7xl`) for optimal readability. 
- **Responsive Behavior:** 
  - **Desktop:** 12-column grid with 24px margins.
  - **Tablet:** 8-column grid with 16px margins; sidebar may collapse to icons only.
  - **Mobile:** 4-column grid; sidebar becomes a drawer and data tables transform into card stacks to avoid horizontal scrolling.
- **Rhythm:** All margins and paddings are derived from a 4px base unit. Card internal padding is standardized at 24px (`p-6`).

## Elevation & Depth

Visual hierarchy is established through a combination of **Tonal Layers** and **Ambient Shadows**.

- **Level 0 (Canvas):** The `#F8FAFC` base layer serves as the ground.
- **Level 1 (Cards):** All primary content containers are white surfaces with a 1px border (`#E2E8F0`) and a very soft, diffused shadow (e.g., `0 1px 3px 0 rgba(15, 23, 42, 0.05)`).
- **Level 2 (Modals/Dropdowns):** Elevated elements use a more pronounced shadow to indicate focus and separation from the underlying workspace.
- **Interactive States:** Buttons and active navigation links use a subtle inner-glow or shadow-tinted with the Primary Blue to indicate they are "clickable" or "active."

## Shapes

The design uses a **Rounded** (Level 2) shape language to soften the institutional nature of the ERP, making it more approachable for daily use.

- **Standard Elements:** Buttons, input fields, and small badges use a `0.5rem` (8px) radius.
- **Structural Elements:** Dashboard cards and data containers use a larger `1rem` (16px) radius to emphasize their role as distinct modules of information.
- **Action Elements:** Search bars and status badges use a "Pill" (fully rounded) style to distinguish them from structural layouts.

## Components

### Buttons
- **Primary:** Solid `#0963D8` with white text. 8px rounded corners.
- **Secondary:** Light slate background (`#E2E8F0`) with dark text. Used for less critical actions like "Cancel" or "Export."
- **Tertiary:** Outline style with 1px `#E2E8F0` border.

### Chips & Badges
- **Status Chips:** Use fully rounded pill shapes.
  - `PASSED/PAID`: Green text on light emerald background.
  - `PENDING`: Amber text on light gold background.
  - `FAILED/OVERDUE`: Red text on light red background.

### Input Fields
- Height of 36px. Pure white background with a 1px `#E2E8F0` border. On focus, the border transitions to Primary Blue with a subtle 2px glow.

### Data Tables
- Headers use a light slate background (`#F8FAFC`) with `label-caps` typography. Row borders are 1px `#E2E8F0`. Hover states on rows use a very faint blue tint (`#F1F5F9`).

### Navigation Sidebar
- Background: `#0B1437`. Active items feature a Primary Blue vertical bar on the left and a subtle white-opacity hover state. Icons are mandatory for every top-level navigation item.

### Educational Widgets
- **Notice Board:** A vertical stack of list items with a "Pin" icon for urgent notices.
- **Grade Grid:** High-contrast numeric display with sticky first columns for student names.