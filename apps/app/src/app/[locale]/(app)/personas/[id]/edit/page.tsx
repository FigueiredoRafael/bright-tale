"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function EditPersonaRedirect() {
    const params = useParams()
    const router = useRouter()
    const locale = params.locale as string
    const id = params.id as string

    useEffect(() => {
        router.replace(`/${locale}/personas/${id}`)
    }, [locale, id, router])

    return null
}
