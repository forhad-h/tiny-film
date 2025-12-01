import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${process.env.SMYTHOS_MICRO_FILM_MAKER_BASE_URL}/api/random-concept-generator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SMYTHOS_MICRO_FILM_MAKER_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error("Error generating random concepts:", error)
    return NextResponse.json(
      { error: "Failed to generate random concepts" },
      { status: 500 }
    )
  }
}
