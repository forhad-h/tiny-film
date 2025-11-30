import { NextRequest, NextResponse } from "next/server"

const API_BASE_URL = "https://cmik1637i20xiv4jovk9r6ieu.agent.a.smyth.ai"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${API_BASE_URL}/api/validate-script`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()

    return NextResponse.json({ result: text }, { status: 200 })
  } catch (error) {
    console.error("Error validating script:", error)
    return NextResponse.json(
      { error: "Failed to validate script" },
      { status: 500 }
    )
  }
}
