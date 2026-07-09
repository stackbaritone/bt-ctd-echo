import { useState, useCallback } from 'react'

const ADMIN_PASSWORD_HASH = import.meta.env.VITE_ADMIN_HASH || ''

const MODE_PASSWORD_HASHES = {
  gestion: import.meta.env.VITE_MODE_HASH_GESTION || 'cb336e03b55ca7d7f6b03ff1366767deb7d1cb7bc98fed7c6c1f99086124f9a8',
  equipe_admin: import.meta.env.VITE_MODE_HASH_EQUIPE_ADMIN || 'a3583cb38b9453f1cc8bc9064cdf267d47e54e5f12b91e806525cd9e918665b9',
  relations_fournisseurs: import.meta.env.VITE_MODE_HASH_RELATIONS_FOURNISSEURS || '8b0bf8d5cb34af871d81d82d2ba8086385d128672d8931ec988f89ca7889fa83',
  cap: import.meta.env.VITE_MODE_HASH_CAP || '2386ac47dd21844f012340a6c3f570ff61623d6511ac305f066cb73291050a12'
}

export const MODE_CONFIG = {
  conseillers: { icon: '👥', labelFr: 'Conseillers', labelEn: 'Advisors', requiresAuth: false, color: 'emerald' },
  gestion: { icon: '🔐', labelFr: 'Gestion', labelEn: 'Management', requiresAuth: true, color: 'amber' },
  equipe_admin: { icon: '👔', labelFr: 'Équipe Admin', labelEn: 'Admin Team', requiresAuth: true, color: 'blue' },
  relations_fournisseurs: { icon: '🤝', labelFr: 'Relations fournisseurs', labelEn: 'Supplier Relations', requiresAuth: true, color: 'purple' },
  cap: { icon: '🎓', labelFr: 'CAP', labelEn: 'CAP', requiresAuth: true, color: 'teal' }
}

async function sha256(text) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useAuthState(interfaceLanguage) {
  // Admin auth state
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')
  const [showAdminPassword, setShowAdminPassword] = useState(false)

  // Mode selection state
  const [selectedMode, setSelectedMode] = useState(() => {
    try { return localStorage.getItem('ea_selected_mode') || 'conseillers' } catch { return 'conseillers' }
  })
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [showModeAuthModal, setShowModeAuthModal] = useState(false)
  const [pendingMode, setPendingMode] = useState(null)
  const [managementPassword, setManagementPassword] = useState('')
  const [managementError, setManagementError] = useState('')
  const [showManagementPassword, setShowManagementPassword] = useState(false)

  const handleAdminLogin = useCallback(async () => {
    if (!adminPassword) {
      setAdminError(interfaceLanguage === 'fr' ? 'Veuillez entrer un mot de passe' : 'Please enter a password')
      return
    }

    try {
      const hash = await sha256(adminPassword)

      if (hash === ADMIN_PASSWORD_HASH) {
        localStorage.setItem('ea_admin_auth', 'true')
        setShowAdminModal(false)
        setAdminPassword('')
        setAdminError('')

        const adminUrl = new URL('./admin/admin-simple.html', window.location.href).href
        window.open(adminUrl, '_blank', 'noopener')
      } else {
        setAdminError(interfaceLanguage === 'fr' ? 'Mot de passe incorrect' : 'Incorrect password')
        setAdminPassword('')
      }
    } catch (e) {
      console.error('Admin auth error:', e)
      setAdminError(interfaceLanguage === 'fr' ? 'Erreur d\'authentification' : 'Authentication error')
    }
  }, [adminPassword, interfaceLanguage])

  const handleModeSelect = useCallback((mode) => {
    const config = MODE_CONFIG[mode]
    if (!config) return

    if (config.requiresAuth && selectedMode === 'conseillers') {
      setPendingMode(mode)
      setShowModeAuthModal(true)
      setManagementPassword('')
      setManagementError('')
    } else {
      localStorage.setItem('ea_selected_mode', mode)
      setSelectedMode(mode)
    }
    setShowModeMenu(false)
  }, [selectedMode])

  const handleModeAuth = useCallback(async () => {
    if (!managementPassword) {
      setManagementError(interfaceLanguage === 'fr' ? 'Veuillez entrer le code' : 'Please enter the code')
      return
    }

    try {
      const hash = await sha256(managementPassword)

      const expectedHash = MODE_PASSWORD_HASHES[pendingMode]
      if (hash === expectedHash) {
        localStorage.setItem('ea_selected_mode', pendingMode)
        setSelectedMode(pendingMode)
        setShowModeAuthModal(false)
        setManagementPassword('')
        setManagementError('')
        setShowManagementPassword(false)
        setPendingMode(null)
      } else {
        setManagementError(interfaceLanguage === 'fr' ? 'Code incorrect' : 'Incorrect code')
        setManagementPassword('')
      }
    } catch (e) {
      console.error('Mode auth error:', e)
      setManagementError(interfaceLanguage === 'fr' ? 'Erreur d\'authentification' : 'Authentication error')
    }
  }, [managementPassword, pendingMode, interfaceLanguage])

  return {
    // Admin
    showAdminModal, setShowAdminModal,
    adminPassword, setAdminPassword,
    adminError, setAdminError,
    showAdminPassword, setShowAdminPassword,
    handleAdminLogin,
    // Mode
    selectedMode, setSelectedMode,
    showModeMenu, setShowModeMenu,
    showModeAuthModal, setShowModeAuthModal,
    pendingMode, setPendingMode,
    managementPassword, setManagementPassword,
    managementError, setManagementError,
    showManagementPassword, setShowManagementPassword,
    handleModeSelect,
    handleModeAuth
  }
}
