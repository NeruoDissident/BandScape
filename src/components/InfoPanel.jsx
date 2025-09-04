import useDataStore from '../store/DataStore'

function InfoPanel() {
  const { selectedNode } = useDataStore()

  if (!selectedNode) {
    return null
  }

  const { name, type, image_url, location, description, start_date, end_date, youtube_url, link_urls } = selectedNode
  const typeClass = (type || '').toLowerCase()
  const years = start_date || end_date ? `${start_date || ''}${start_date && end_date ? ' — ' : ''}${end_date || (start_date ? 'Present' : '')}` : ''
  
  // Extract a YouTube video ID from common URL formats
  const getYouTubeId = (url) => {
    if (!url) return null
    try {
      const u = new URL(url)
      // https://www.youtube.com/watch?v=VIDEO_ID
      if ((u.hostname.includes('youtube.com')) && u.searchParams.get('v')) {
        return u.searchParams.get('v')
      }
      // https://youtu.be/VIDEO_ID
      if (u.hostname === 'youtu.be') {
        return u.pathname.replace('/', '') || null
      }
      // Shorts: https://www.youtube.com/shorts/VIDEO_ID
      if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/')[2] || null
      }
    } catch (_) { /* noop */ }
    return null
  }

  const youtubeId = type === 'band' && youtube_url ? getYouTubeId(youtube_url) : null

  return (
    <div className="info-panel">
      <div className="info-content">
        <h3>
          {name}
          {type && <span className={`info-type-badge ${typeClass}`}>{type}</span>}
        </h3>
        {years && <div className="info-years">{years}</div>}
        
        {type === 'member' && image_url && (
          <img 
            src={image_url} 
            alt={name}
            className="info-image"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        
        {location && (
          <p className="location">
            {location.city && location.country ? `${location.city}, ${location.country}` : 
             location.city || location.country || 
             (typeof location === 'string' ? location : '')}
          </p>
        )}
        
        {description && (
          <p className="description">{description}</p>
        )}

        {type === 'band' && youtube_url && youtubeId && (
          <a href={youtube_url} target="_blank" rel="noreferrer">
            <img 
              src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`} 
              alt={`${name} YouTube thumbnail`}
              className="info-image"
            />
          </a>
        )}

        {Array.isArray(link_urls) && link_urls.length > 0 && (
          <div className="info-links">
            {link_urls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                Link {i + 1}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default InfoPanel

