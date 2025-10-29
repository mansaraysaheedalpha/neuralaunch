from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # The project ID is hardcoded for this verification script.
    # In a real test suite, this would be dynamic.
    page.goto("http://localhost:3000/app/agent-build/clwz1a3y000001e5695sbe24q")

    # Wait for the main heading to be visible, indicating the page has loaded.
    heading = page.get_by_role("heading", name="AI Agent Build:")
    expect(heading).to_be_visible()

    # Take a screenshot of the initial state of the agent builder page.
    page.screenshot(path="jules-scratch/verification/agent_builder_page.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
