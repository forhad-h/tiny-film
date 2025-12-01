import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(
      `${process.env.SMYTHOS_MICRO_FILM_MAKER_BASE_URL}/api/generate-micro-film-script`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SMYTHOS_MICRO_FILM_MAKER_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(body),
      }
    )

    const text = await response.text()

    return NextResponse.json({ result: text }, { status: 200 })
  } catch (error) {
    console.error("Error generating script:", error)
    return NextResponse.json(
      { error: "Failed to generate script" },
      { status: 500 }
    )
  }
}
