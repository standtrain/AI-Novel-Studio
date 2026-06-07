import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import ParticleBackground from '../components/landing/ParticleBackground';
import LandingHeader from '../components/landing/LandingHeader';
import HeroSection from '../components/landing/HeroSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import StatsSection from '../components/landing/StatsSection';
import FeatureShowcase from '../components/landing/FeatureShowcase';
import CTASection from '../components/landing/CTASection';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-root">
      <ParticleBackground />
      <LandingHeader
        isAuthenticated={isAuthenticated}
        onLogin={() => navigate('/login')}
        onRegister={() => navigate('/register')}
        onEnterApp={() => navigate('/home')}
      />
      <main>
        <HeroSection
          onStart={() => navigate(isAuthenticated ? '/home' : '/register')}
          onLearnMore={scrollToFeatures}
        />
        <FeaturesSection />
        <HowItWorksSection />
        <StatsSection />
        <FeatureShowcase />
        <CTASection
          isAuthenticated={isAuthenticated}
          onStart={() => navigate(isAuthenticated ? '/home' : '/register')}
        />
      </main>
    </div>
  );
};

export default LandingPage;
