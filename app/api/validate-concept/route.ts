import { NextRequest, NextResponse } from "next/server"
import { ValidateConceptResponse } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${process.env.SMYTHOS_MICRO_FILM_MAKER_BASE_URL}/api/validate-concept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SMYTHOS_MICRO_FILM_MAKER_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`)
    }

    const validationResult: ValidateConceptResponse = await response.json()

    return NextResponse.json(validationResult, { status: 200 })
  } catch (error) {
    console.error("Error validating concept:", error)
    return NextResponse.json(
      { error: "Failed to validate concept" },
      { status: 500 }
    )
  }
}
