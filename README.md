# Cuota — Call Review Engine

Sales call review tool with weighted scorecard framework, momentum tracking, close probability scoring, and risk detection.

## Quick Start (Local)

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Deploy to Vercel (Live URL)

### One-time setup (5 minutes):

1. **Create a GitHub account** (if you don't have one): https://github.com
2. **Create a Vercel account**: https://vercel.com (sign in with GitHub)
3. **Install Git** (if needed): https://git-scm.com/downloads

### Push to GitHub:

```bash
# In this project folder:
git init
git add .
git commit -m "Cuota Call Review Engine v1"

# Create a new repo on GitHub (https://github.com/new)
# Name it: cuota-call-review
# Leave it empty (no README, no .gitignore)

# Then run (replace YOUR_USERNAME):
git remote add origin https://github.com/YOUR_USERNAME/cuota-call-review.git
git branch -M main
git push -u origin main
```

### Connect to Vercel:

1. Go to https://vercel.com/new
2. Click "Import" next to your `cuota-call-review` repo
3. Framework Preset: **Vite**
4. Click **Deploy**
5. Done — you'll get a URL like `cuota-call-review.vercel.app`

### Custom Domain (optional):

1. In Vercel dashboard → Settings → Domains
2. Add `review.cuota.io` (or whatever you want)
3. Add the DNS records Vercel gives you in your domain registrar

## Future Enhancements

- [ ] AI-powered transcript analysis via Claude API
- [ ] PDF export for client delivery
- [ ] Deal-over-deal tracking
- [ ] Team aggregate dashboards
- [ ] Gong/Fireflies integration
