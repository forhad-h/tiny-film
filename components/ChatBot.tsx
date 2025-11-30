"use client"

import { useState } from "react"
import { useFilm } from "@/lib/FilmContext"
import {
  ValidateConceptRequest,
  GenerateScriptRequest,
  ValidateScriptRequest,
  PlanShotsRequest,
  ApiResponse,
} from "@/lib/types"

export default function ChatBot() {
  const {
    state,
    setState,
    messages,
    addMessage,
    isGenerating,
    setIsGenerating,
  } = useFilm()
  const [input, setInput] = useState("")
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [editedScript, setEditedScript] = useState("")

  const handleValidateEditedScript = async () => {
    if (!editedScript.trim() || isGenerating) return

    setIsGenerating(true)
    setState({ ...state, step: "validating-script" })

    addMessage({
      role: "assistant",
      content: "Validating your edited script...",
    })

    try {
      const validateScriptRequest: ValidateScriptRequest = {
        script: editedScript,
      }

      const validateScriptResponse = await fetch("/api/validate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validateScriptRequest),
      })

      const validateScriptData: ApiResponse =
        await validateScriptResponse.json()

      if (validateScriptData.error || !validateScriptData.result) {
        throw new Error(validateScriptData.error || "Failed to validate script")
      }

      const scriptValidation = validateScriptData.result

      if (
        scriptValidation.toLowerCase().includes("issue") ||
        scriptValidation.toLowerCase().includes("violation")
      ) {
        addMessage({
          role: "assistant",
          content: `Script validation found issues:\n${scriptValidation}\n\nPlease edit the script to address these issues.`,
          type: "error",
        })
        setState({ ...state, step: "idle", script: editedScript })
        setIsGenerating(false)
        return
      }

      addMessage({
        role: "assistant",
        content: "Script validated! Planning shots...",
      })

      // Step 4: Plan shots
      setState({ ...state, step: "planning-shots" })

      const shotsRequest: PlanShotsRequest = {
        script: editedScript,
        preferred_sound_style: state.preferredSoundStyle,
        target_platform: state.targetPlatform,
      }

      const shotsResponse = await fetch("/api/plan-shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shotsRequest),
      })

      const shotsData: ApiResponse = await shotsResponse.json()

      if (shotsData.error || !shotsData.result) {
        throw new Error(shotsData.error || "Failed to plan shots")
      }

      const plannedShots = shotsData.result

      setState({
        ...state,
        shots: plannedShots,
        script: editedScript,
        step: "completed",
      })

      addMessage({
        role: "assistant",
        content:
          "Film generated successfully! Check the right panel to view and edit the shots.",
        type: "shots",
      })

      setIsEditingScript(false)
    } catch (error) {
      console.error("Error:", error)
      addMessage({
        role: "assistant",
        content: `Error: ${
          error instanceof Error ? error.message : "An error occurred"
        }`,
        type: "error",
      })
      setState({ ...state, step: "idle" })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() || isGenerating) return

    const userMessage = { role: "user" as const, content: input }
    addMessage(userMessage)
    const userConcept = input
    setInput("")
    setIsGenerating(true)

    try {
      // Step 1: Validate concept
      setState({ ...state, step: "validating-concept", concept: userConcept })

      addMessage({
        role: "assistant",
        content: "Validating your concept...",
      })

      const validateRequest: ValidateConceptRequest = {
        concept: userConcept,
      }

      const validateResponse = await fetch("/api/validate-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validateRequest),
      })

      const validateData: ApiResponse = await validateResponse.json()

      if (validateData.error || !validateData.result) {
        throw new Error(validateData.error || "Failed to validate concept")
      }

      // Check if concept is valid or has suggestions
      const validationResult = validateData.result

      if (
        validationResult.toLowerCase().includes("not allowed") ||
        validationResult.toLowerCase().includes("violation") ||
        validationResult.toLowerCase().includes("suggestion")
      ) {
        addMessage({
          role: "assistant",
          content: `${validationResult}\n\nPlease try a different concept that aligns with our guidelines.`,
          type: "suggestion",
        })
        setState({ ...state, step: "idle" })
        setIsGenerating(false)
        return
      }

      addMessage({
        role: "assistant",
        content: "Concept validated! Generating script...",
      })

      // Step 2: Generate script
      setState({ ...state, step: "generating-script" })

      const scriptRequest: GenerateScriptRequest = {
        concept: userConcept,
      }

      const scriptResponse = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scriptRequest),
      })

      const scriptData: ApiResponse = await scriptResponse.json()

      if (scriptData.error || !scriptData.result) {
        throw new Error(scriptData.error || "Failed to generate script")
      }

      const generatedScript = scriptData.result
      setState({ ...state, script: generatedScript, step: "validating-script" })
      setEditedScript(generatedScript)

      addMessage({
        role: "assistant",
        content:
          "Script generated! You can review and edit it below before continuing..",
      })

      addMessage({
        role: "assistant",
        content: generatedScript,
        type: "script",
      })

      setIsEditingScript(true)
      setIsGenerating(false)
    } catch (error) {
      console.error("Error:", error)
      addMessage({
        role: "assistant",
        content: `Error: ${
          error instanceof Error ? error.message : "An error occurred"
        }`,
        type: "error",
      })
      setState({ ...state, step: "idle" })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white">Tiny Film Maker</h1>
        <p className="text-sm text-gray-400 mt-1">
          Describe the film you want to create
        </p>
        {state.step !== "idle" && (
          <div className="mt-2">
            <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded-full">
              {state.step.replace(/-/g, " ").toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : message.type === "error"
                  ? "bg-red-900 text-red-100"
                  : message.type === "suggestion"
                  ? "bg-yellow-900 text-yellow-100"
                  : "bg-gray-800 text-gray-100"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 rounded-lg px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Script and Shots Display */}
      {!isEditingScript && (state.script || state.shots) && (
        <div className="border-t border-gray-800 p-4 space-y-4 max-h-96 overflow-y-auto">
          {/* Script Section */}
          {state.script && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
              <h4 className="text-white font-semibold mb-2 text-sm flex items-center">
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Script
              </h4>
              <div className="bg-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                <pre className="text-gray-300 text-xs whitespace-pre-wrap font-mono">
                  {state.script}
                </pre>
              </div>
            </div>
          )}

          {/* Shots Section */}
          {state.shots && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
              <h4 className="text-white font-semibold mb-2 text-sm flex items-center">
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Shot Plan
              </h4>
              <div className="bg-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                <pre className="text-gray-300 text-xs whitespace-pre-wrap font-mono">
                  {state.shots}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Script Editor Modal */}
      {isEditingScript && state.script && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <h2 className="text-2xl font-bold text-white mb-2">
                Edit Your Script
              </h2>
              <p className="text-gray-400 mb-6">
                Review and modify the script below, then click Continue to
                validate.
              </p>

              <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Script Content
                </label>
                <textarea
                  value={editedScript}
                  onChange={(e) => setEditedScript(e.target.value)}
                  className="w-full h-96 bg-gray-950 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 font-mono text-sm resize-none"
                  placeholder="Your script will appear here..."
                  disabled={isGenerating}
                  spellCheck={false}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleValidateEditedScript}
                  disabled={isGenerating || !editedScript.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg px-8 py-3 font-medium transition-colors"
                >
                  {isGenerating ? "Validating..." : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Form */}
      {!isEditingScript && (
        <div className="p-6 border-t border-gray-800">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              name="film-idea"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your film idea..."
              className="relative z-10 flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 placeholder-gray-500"
              disabled={isGenerating}
            />
            <button
              type="submit"
              disabled={isGenerating || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg px-6 py-3 font-medium transition-colors"
            >
              {isGenerating ? "Processing..." : "Generate"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
