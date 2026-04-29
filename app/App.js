import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, 
  Animated, ScrollView, StatusBar, Platform, Dimensions, 
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  TouchableWithoutFeedback, ImageBackground 
} from 'react-native';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

// Firebase Importları
import { db } from './firebaseConfig'; 
import { collection, addDoc, onSnapshot, query, orderBy, doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";

const { width, height } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// --- YARDIMCI FONKSİYONLAR ---
const getWeatherDetails = (iconCode) => {
  const mapping = {
    '01d': { icon: 'wb-sunny', desc: 'Güneşli' }, '01n': { icon: 'wb-sunny', desc: 'Açık' },
    '02d': { icon: 'cloud-queue', desc: 'Parçalı Bulutlu' }, '02n': { icon: 'cloud-queue', desc: 'Bulutlu' },
    '03d': { icon: 'filter-drama', desc: 'Bulutlu' }, '03n': { icon: 'filter-drama', desc: 'Bulutlu' },
    '04d': { icon: 'cloud', desc: 'Yoğun Bulutlu' }, '04n': { icon: 'cloud', desc: 'Yoğun Bulutlu' },
    '09d': { icon: 'beach-access', desc: 'Sağanak' }, '10d': { icon: 'umbrella', desc: 'Yağmurlu' },
    '11d': { icon: 'flash-on', desc: 'Fırtına' }, '13d': { icon: 'ac-unit', desc: 'Karlı' },
    '50d': { icon: 'blur-on', desc: 'Sisli' },
  };
  return mapping[iconCode] || { icon: 'wb-cloudy', desc: 'Bulutlu' };
};

const LivePing = () => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 2.5, duration: 1500, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <View style={styles.pingContainer}>
      <Animated.View style={[styles.pingCircle, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]} />
      <View style={styles.pingDot} />
    </View>
  );
};

const formatDateInput = (text) => {
  let cleaned = text.replace(/\D/g, "");
  let formatted = "";
  if (cleaned.length > 0) formatted += cleaned.slice(0, 2);
  if (cleaned.length > 2) formatted += "." + cleaned.slice(2, 4);
  if (cleaned.length > 4) formatted += "." + cleaned.slice(4, 8);
  if (cleaned.length > 8) formatted += " " + cleaned.slice(8, 10);
  if (cleaned.length > 10) formatted += ":" + cleaned.slice(10, 12);
  return formatted.slice(0, 16);
};

const formatISOToInput = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const calculateTimeLeft = (targetDate) => {
  const difference = +new Date(targetDate) - +new Date();
  if (difference <= 0) return { total: 0, days: 0, hours: 0, mins: 0, secs: 0 };
  return {
    total: difference,
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    mins: Math.floor((difference / 1000 / 60) % 60),
    secs: Math.floor((difference / 1000) % 60),
  };
};

const AnimatedForecastCard = ({ item, index }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(100)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, delay: index * 150, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay: index * 150, friction: 7, tension: 30, useNativeDriver: true })
    ]).start();
  }, [item]);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <BlurView intensity={index === 0 ? 0 : 35} tint="light" style={[styles.forecastCard, index === 0 && styles.activeCard]}>
        <Text style={[styles.forecastDayText, index === 0 && {color: '#000'}]}>{item.day}</Text>
        <Text style={[styles.forecastDateText, index === 0 && {color: 'rgba(0,0,0,0.5)'}]}>{item.date}</Text>
        <MaterialIcons name={item.icon} size={32} color={index === 0 ? "#000" : "#fff"} />
        <Text style={[styles.forecastTempText, index === 0 && {color: '#000'}]}>{Math.round(item.temp)}°</Text>
        <Text style={[styles.forecastDescText, index === 0 && {color: '#000'}]}>{item.desc}</Text>
        <View style={[styles.humidityBox, index === 0 && {backgroundColor: 'rgba(0,0,0,0.1)'}]}>
            <Ionicons name="water-outline" size={10} color={index === 0 ? "#000" : "#888"} />
            <Text style={[styles.humidityText, index === 0 && {color: '#000'}]}>%{item.humidity}</Text>
        </View>
      </BlurView>
    </Animated.View>
  );
};

export default function FlightScreen() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [journeys, setJourneys] = useState([]);
  const [activeJourney, setActiveJourney] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ total: 0, days: 0, hours: 0, mins: 0, secs: 0 });
  const [forecast, setForecast] = useState([]);
  const [isShowingOriginWeather, setIsShowingOriginWeather] = useState(false);
  const [bgContent, setBgContent] = useState({ type: 'image', url: 'https://images.pexels.com/photos/214574/pexels-photo-214574.jpeg' });
  const [editingId, setEditingId] = useState(null);
  const [currentOriginWeather, setCurrentOriginWeather] = useState({ temp: '-', desc: '...', icon: 'wb-sunny' });
  const [currentDestWeather, setCurrentDestWeather] = useState({ temp: '-', desc: '...', icon: 'wb-sunny' });

  const [form, setForm] = useState({ origin: '', originCity: '', dest: '', destCity: '', start: '', end: '' });
  const drawerAnim = useRef(new Animated.Value(-width)).current;
  const strokeAnim = useRef(new Animated.Value(264)).current;
  
  const API_KEY = "e47913adad58a5e7a06c10942908f148";
  const PIXABAY_KEY = "54831274-740d6c50bd0fbb1d5ec27f93a";

  const player = useVideoPlayer(bgContent.type === 'video' ? bgContent.url : null, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    const q = query(collection(db, "journeys"), orderBy("start", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      allData.forEach(async (j) => {
        if (j.end && new Date(j.end).getTime() < now) {
          await deleteDoc(doc(db, "journeys", j.id));
        }
      });
      const validData = allData.filter(j => !j.end || new Date(j.end).getTime() >= now);
      setJourneys(validData);
      if (validData.length > 0) {
        if (!activeJourney || !validData.find(j => j.id === activeJourney.id)) {
          setActiveJourney(validData[0]);
        }
      } else { setActiveJourney(null); }
    });
    return () => unsubscribe();
  }, [activeJourney]);

  useEffect(() => {
    if (!activeJourney) return;
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft(activeJourney.start);
      setTimeLeft(remaining);
      const currentProgress = (remaining.secs + (1000 - new Date().getMilliseconds()) / 1000) / 60;
      const targetOffset = 264 - (264 * currentProgress);
      Animated.timing(strokeAnim, { toValue: targetOffset, duration: 1000, useNativeDriver: true }).start();
    }, 1000);
    return () => clearInterval(timer);
  }, [activeJourney]);

  useEffect(() => {
    if (!activeJourney) return;
    const fetchBackgroundMedia = async () => {
      try {
        const queryCity = encodeURIComponent(activeJourney.destCity.toLowerCase());
        const isVideo = Math.random() > 0.5;
        let url = isVideo ? `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${queryCity}+city&per_page=10` : `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${queryCity}+city+travel+landscape&image_type=photo&orientation=vertical&per_page=10`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.hits && data.hits.length > 0) {
          const randomItem = data.hits[Math.floor(Math.random() * data.hits.length)];
          const newUrl = isVideo ? randomItem.videos.medium.url : randomItem.largeImageURL;
          setBgContent({ type: isVideo ? 'video' : 'image', url: newUrl });
        } else {
          setBgContent({ type: 'image', url: "https://images.pexels.com/photos/214574/pexels-photo-214574.jpeg" });
        }
      } catch (e) { }
    };
    fetchBackgroundMedia();
    const interval = setInterval(fetchBackgroundMedia, 40000); 
    return () => clearInterval(interval);
  }, [activeJourney?.destCity]);

  useEffect(() => {
    if (!activeJourney) return;
    const fetchCurrentWeather = async () => {
      try {
        const res1 = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${activeJourney.originCity}&units=metric&lang=tr&appid=${API_KEY}`);
        const data1 = await res1.json();
        if(data1.cod === 200) setCurrentOriginWeather({ temp: Math.round(data1.main.temp), desc: data1.weather[0].description.toUpperCase(), icon: getWeatherDetails(data1.weather[0].icon).icon });
        const res2 = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${activeJourney.destCity}&units=metric&lang=tr&appid=${API_KEY}`);
        const data2 = await res2.json();
        if(data2.cod === 200) setCurrentDestWeather({ temp: Math.round(data2.main.temp), desc: data2.weather[0].description.toUpperCase(), icon: getWeatherDetails(data2.weather[0].icon).icon });
      } catch (e) { }
    };
    fetchCurrentWeather();
    const interval = setInterval(fetchCurrentWeather, 600000); 
    return () => clearInterval(interval);
  }, [activeJourney]);

  useEffect(() => {
    if (!activeJourney) return;
    const fetchForecastLogic = async () => {
      setWeatherLoading(true);
      try {
        const destUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${activeJourney.destCity}&units=metric&lang=tr&appid=${API_KEY}`;
        const response = await fetch(destUrl);
        const data = await response.json();
        if (data.cod === "200") {
          const start = new Date(activeJourney.start); start.setHours(0,0,0,0);
          const end = new Date(activeJourney.end); end.setHours(23,59,59,999);
          const inRangeData = data.list.filter(item => { const time = item.dt * 1000; return time >= start.getTime() && time <= end.getTime(); });
          if (inRangeData.length > 0) { processForecast(filterUniqueDaysInRange(inRangeData)); setIsShowingOriginWeather(false); }
          else fetchFallbackForecast();
        } else fetchFallbackForecast();
      } catch (e) { fetchFallbackForecast(); }
      finally { setWeatherLoading(false); }
    };
    const fetchFallbackForecast = async () => {
      const originUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${activeJourney.originCity}&units=metric&lang=tr&appid=${API_KEY}`;
      const res = await fetch(originUrl);
      const data = await res.json();
      if(data.cod === "200") { processForecast(data.list.filter(r => r.dt_txt.includes("12:00:00"))); setIsShowingOriginWeather(true); }
    };
    const filterUniqueDaysInRange = (list) => {
        const days = {};
        list.forEach(item => {
            const dateStr = new Date(item.dt * 1000).toLocaleDateString('tr-TR');
            if (!days[dateStr]) days[dateStr] = item;
            else { const hour = new Date(item.dt * 1000).getHours(); if (Math.abs(hour - 12) < Math.abs(new Date(days[dateStr].dt * 1000).getHours() - 12)) days[dateStr] = item; }
        });
        return Object.values(days);
    };
    const processForecast = (list) => {
      const formatted = list.map(item => { const detail = getWeatherDetails(item.weather[0].icon); return { day: new Date(item.dt * 1000).toLocaleDateString('tr-TR', { weekday: 'long' }), date: new Date(item.dt * 1000).toLocaleDateString('tr-TR'), temp: item.main.temp, icon: detail.icon, desc: detail.desc, humidity: item.main.humidity }; });
      setForecast(formatted);
    };
    fetchForecastLogic();
  }, [activeJourney]);

  const toggleDrawer = () => {
    const toValue = drawerOpen ? -width : 0;
    Animated.timing(drawerAnim, { toValue, duration: 300, useNativeDriver: true }).start();
    setDrawerOpen(!drawerOpen);
    if (drawerOpen) { 
        setIsAdmin(false); 
        setIsLoggingIn(false);
        setEditingId(null); 
        setAdminUser(''); 
        setAdminPass('');
        setForm({ origin: '', originCity: '', dest: '', destCity: '', start: '', end: '' }); 
    }
  };

  const closeDrawerOnly = () => { if (drawerOpen) toggleDrawer(); };

  const handleAdminLogin = async () => {
    if (!adminUser || !adminPass) return Alert.alert("Hata", "Tüm alanları girin.");
    setLoading(true);
    try {
      const adminSnap = await getDoc(doc(db, "admins", "config"));
      if (adminSnap.exists() && adminUser === adminSnap.data().isim && adminPass === adminSnap.data().password) {
        setIsAdmin(true);
        setIsLoggingIn(false);
      } else {
        Alert.alert("Hata", "Bilgiler yanlış.");
      }
    } catch (e) {
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  };

  const handleJourneyLongPress = (journey) => {
    if (!isAdmin) return;
    Alert.alert(
      "İşlem Seçin",
      `${journey.destCity} gezisi için ne yapmak istersiniz?`,
      [
        { text: "Düzenle", onPress: () => startEditing(journey) },
        { text: "Sil", style: "destructive", onPress: () => deleteJourney(journey.id) },
        { text: "Vazgeç", style: "cancel" }
      ]
    );
  };

  const startEditing = (journey) => {
    setEditingId(journey.id);
    setForm({
      origin: journey.origin,
      originCity: journey.originCity,
      dest: journey.dest,
      destCity: journey.destCity,
      start: formatISOToInput(journey.start),
      end: formatISOToInput(journey.end),
    });
  };

  const deleteJourney = async (id) => {
    try {
      await deleteDoc(doc(db, "journeys", id));
      Alert.alert("Başarılı", "Gezi silindi.");
    } catch (e) { Alert.alert("Hata", "Silinemedi."); }
  };

  const saveJourney = async () => {
    if(!form.origin || !form.originCity || !form.dest || !form.destCity || !form.start || !form.end) return Alert.alert("Hata", "Tüm alanları doldurun.");
    setLoading(true);
    try {
      const parseDate = (dStr) => {
        const parts = dStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s(\d{2}):(\d{2})/);
        if (!parts) throw new Error();
        const [_, day, month, year, hour, min] = parts;
        return new Date(year, month - 1, day, hour, min).toISOString();
      };
      const journeyData = { ...form, start: parseDate(form.start), end: parseDate(form.end) };
      if (editingId) {
        await updateDoc(doc(db, "journeys", editingId), journeyData);
        Alert.alert("Başarılı", "Gezi güncellendi.");
      } else {
        await addDoc(collection(db, "journeys"), journeyData);
        Alert.alert("Başarılı", "Yeni gezi eklendi.");
      }
      setForm({ origin: '', originCity: '', dest: '', destCity: '', start: '', end: '' });
      setEditingId(null);
    } catch (e) { Alert.alert("Hata", "Tarih formatı: GG.AA.YYYY SS:DD"); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent={true} />
        
        {activeJourney && (
          <View style={styles.absoluteBackground}>
            {bgContent.type === 'video' ? (
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            ) : (
              <ImageBackground source={{ uri: bgContent.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
            <View style={styles.darkOverlay} />
          </View>
        )}

        {drawerOpen && <TouchableWithoutFeedback onPress={closeDrawerOnly}><View style={styles.overlay} /></TouchableWithoutFeedback>}

        <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
          <View style={[StyleSheet.absoluteFill, Platform.OS === 'android' ? styles.androidDrawerBg : styles.iosDrawerBg]}>
            {Platform.OS === 'ios' && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />}
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
            <View style={styles.drawerContent}>
              <Text style={styles.drawerTitle}>GEZİLERİM</Text>
              
              <ScrollView style={{maxHeight: 220}} showsVerticalScrollIndicator={false}>
                {journeys.map((j) => (
                  <TouchableOpacity 
                    key={j.id} 
                    style={[styles.journeyTab, activeJourney?.id === j.id && {borderColor: '#FFD700', borderWidth: 1}]} 
                    onPress={() => {setActiveJourney(j); toggleDrawer();}} 
                    onLongPress={() => handleJourneyLongPress(j)}
                  >
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems: 'center'}}>
                        <Text style={styles.journeyTabText}>{j.originCity} ➔ {j.destCity}</Text>
                        {isAdmin && <MaterialIcons name="more-vert" size={16} color="#FFD700" />}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <View style={{flex: 1, justifyContent: 'flex-end', marginBottom: 20}}>
                {isAdmin ? (
                  <View style={styles.adminForm}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 10}}>
                       <Text style={styles.adminTitle}>{editingId ? "DÜZENLE" : "YENİ EKLE"}</Text>
                       <TouchableOpacity onPress={() => {setIsAdmin(false); setEditingId(null);}}>
                         <Ionicons name="close-circle" size={20} color="#ff4444" />
                       </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <TextInput placeholder="Kalkış Kodu (AYT)" placeholderTextColor="#666" style={styles.input} value={form.origin} onChangeText={(v) => setForm({...form, origin: v.toUpperCase()})} />
                      <TextInput placeholder="Kalkış Şehri" placeholderTextColor="#666" style={styles.input} value={form.originCity} onChangeText={(v) => setForm({...form, originCity: v.toUpperCase()})} />
                      <TextInput placeholder="Varış Kodu (HAJ)" placeholderTextColor="#666" style={styles.input} value={form.dest} onChangeText={(v) => setForm({...form, dest: v.toUpperCase()})} />
                      <TextInput placeholder="Varış Şehri" placeholderTextColor="#666" style={styles.input} value={form.destCity} onChangeText={(v) => setForm({...form, destCity: v.toUpperCase()})} />
                      <TextInput placeholder="Gidiş (GG.AA.YYYY SS:DD)" keyboardType="numeric" placeholderTextColor="#666" style={styles.input} value={form.start} onChangeText={(v) => setForm({...form, start: formatDateInput(v)})} />
                      <TextInput placeholder="Dönüş (GG.AA.YYYY SS:DD)" keyboardType="numeric" placeholderTextColor="#666" style={styles.input} value={form.end} onChangeText={(v) => setForm({...form, end: formatDateInput(v)})} />
                      <TouchableOpacity style={styles.saveBtn} onPress={saveJourney} disabled={loading}>
                        {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={{fontWeight:'bold'}}>{editingId ? "GÜNCELLE" : "KAYDET"}</Text>}
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                ) : isLoggingIn ? (
                  <View style={styles.adminForm}>
                     <Text style={[styles.adminTitle, {marginBottom: 10}]}>YÖNETİCİ GİRİŞİ</Text>
                     <TextInput placeholder="Kullanıcı Adı" placeholderTextColor="#666" style={styles.input} value={adminUser} onChangeText={setAdminUser} />
                     <TextInput placeholder="Şifre" secureTextEntry placeholderTextColor="#666" style={styles.input} value={adminPass} onChangeText={setAdminPass} />
                     <TouchableOpacity style={styles.saveBtn} onPress={handleAdminLogin}>
                       {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={{fontWeight:'bold'}}>GİRİŞ YAP</Text>}
                     </TouchableOpacity>
                     <TouchableOpacity style={{marginTop: 10, alignItems:'center'}} onPress={() => setIsLoggingIn(false)}>
                       <Text style={{color:'#888', fontSize: 11}}>VAZGEÇ</Text>
                     </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.adminBtnStatic} onPress={() => setIsLoggingIn(true)}>
                    <MaterialIcons name="lock-outline" size={14} color="#555" />
                    <Text style={{color:'#555', fontSize:11, fontWeight:'bold'}}> YÖNETİCİ PANELİNİ AÇ</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>

        {!activeJourney ? (
          <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}>
                <TouchableOpacity style={[styles.headerCircleBtn, {position:'absolute', top: 60, left: 25}]} onPress={toggleDrawer}><Feather name="menu" size={20} color="#fff" /></TouchableOpacity>
                <MaterialIcons name="flight-takeoff" size={60} color="#222" />
                <Text style={{color: '#444', marginTop: 20}}>Kayıtlı gezi bulunamadı.</Text>
          </View>
        ) : (
          <View style={styles.container}>
              <View style={styles.header}>
                  <TouchableOpacity style={styles.headerCircleBtn} onPress={toggleDrawer}><Feather name="menu" size={20} color="#fff" /></TouchableOpacity>
                  <View style={styles.badge}>
                    <MaterialIcons name="flight-takeoff" size={14} color="#FFD700" />
                    <Text style={styles.badgeText}>{activeJourney.destCity} SEYAHAT</Text>
                  </View>
              </View>

              <View style={styles.flightInfo}>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.airportCode}>{activeJourney.origin}</Text>
                    <Text style={styles.cityText}>{activeJourney.originCity}</Text>
                </View>
                <View style={styles.flightLineContainer}>
                    <View style={styles.lineStyle} />
                    <View style={styles.planeIconCircle}><MaterialIcons name="flight" size={18} color="#FFD700" style={{ transform: [{ rotate: '90deg' }] }} /></View>
                    <View style={styles.lineStyle} />
                </View>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.airportCode}>{activeJourney.dest}</Text>
                    <Text style={styles.cityText}>{activeJourney.destCity}</Text>
                </View>
              </View>

              <View style={styles.counterContainer}>
                <Svg height="260" width="260" viewBox="0 0 100 100">
                    <Circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
                    <AnimatedCircle cx="50" cy="50" r="42" stroke="#FFD700" strokeWidth="2" fill="none" strokeDasharray="264" strokeDashoffset={strokeAnim} strokeLinecap="round" transform="rotate(-90 50 50)" />
                </Svg>
                <View style={styles.counterTextWrapper}>
                    <Text style={styles.kalanZaman}>KALAN ZAMAN</Text>
                    <Text style={styles.timeNum}>{timeLeft.days} : {timeLeft.hours.toString().padStart(2, '0')} : {timeLeft.mins.toString().padStart(2, '0')} : {timeLeft.secs.toString().padStart(2, '0')}</Text>
                    <View style={styles.labelRow}>{['GÜN', 'SAAT', 'DAK', 'SAN'].map((l) => (<Text key={l} style={styles.label}>{l}</Text>))}</View>
                </View>
              </View>

              <View style={styles.forecastWrapper}>
                <Text style={[styles.forecastTitle, { paddingHorizontal: 20 }]}>{isShowingOriginWeather ? `${activeJourney.originCity} TAHMİNİ` : `${activeJourney.destCity} GEZİ TAKVİMİ`}</Text>
                {weatherLoading ? <ActivityIndicator color="#FFD700" style={{ marginTop: 30 }} /> : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastScroll}>
                      {forecast.map((item, index) => <AnimatedForecastCard key={index} item={item} index={index} />)}
                  </ScrollView>
                )}
              </View>

              <BlurView intensity={Platform.OS === 'ios' ? 45 : 90} tint="dark" style={[styles.bottomBar, Platform.OS === 'android' && {backgroundColor: 'rgba(15,15,15,0.92)'}]}>
                  <View style={styles.weatherInfoSmall}>
                      <MaterialIcons name={currentOriginWeather.icon} size={20} color="#FFD700" />
                      <View>
                        <Text style={styles.bottomBarSmallTitle}>{activeJourney.origin} ŞU AN</Text>
                        <Text style={styles.bottomBarValue}>{currentOriginWeather.temp}° {currentOriginWeather.desc}</Text>
                      </View>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <LivePing />
                    <Text style={styles.liveText}>CANLI TAKİP</Text>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={styles.weatherInfoSmall}>
                      <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.bottomBarSmallTitle}>{activeJourney.dest} ŞU AN</Text>
                          <Text style={styles.bottomBarValue}>{currentDestWeather.temp}° {currentDestWeather.desc}</Text>
                      </View>
                      <MaterialIcons name={currentDestWeather.icon} size={20} color="#FFD700" />
                  </View>
              </BlurView>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  absoluteBackground: { position: 'absolute', width, height, zIndex: -1 },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90, backgroundColor: 'rgba(0,0,0,0.6)' },
  container: { flex: 1, paddingTop: Platform.OS === 'android' ? 10 : 0 },
  drawer: { 
    position: 'absolute', left: 0, top: 0, bottom: 0, width: width * 0.78, zIndex: 100,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 
  },
  androidDrawerBg: { backgroundColor: '#111', borderRightWidth: 1, borderColor: '#222' },
  iosDrawerBg: { backgroundColor: 'transparent' },
  drawerContent: { flex: 1, padding: 25, paddingTop: 60 },
  drawerTitle: { color: '#FFD700', fontSize: 22, fontWeight: '900', marginBottom: 25, letterSpacing: 1 },
  journeyTab: { backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, marginBottom: 12 },
  journeyTabText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  adminBtnStatic: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 12, borderRadius: 10, alignSelf: 'flex-start' },
  adminForm: { backgroundColor: '#080808', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#222', maxHeight: 440 },
  adminTitle: { color: '#FFD700', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
  input: { backgroundColor: '#161616', color: '#fff', padding: 12, borderRadius: 10, marginBottom: 10, fontSize: 13, borderWidth: 1, borderColor: '#333' },
  saveBtn: { backgroundColor: '#FFD700', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  headerCircleBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center', paddingHorizontal: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  badgeText: { color: '#fff', fontSize: 9, marginLeft: 6, fontWeight: '700', letterSpacing: 1 },
  flightInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, paddingHorizontal: 20 },
  flightLineContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  lineStyle: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  planeIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(21,21,21,0.8)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  airportCode: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  cityText: { color: '#aaa', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: -5 },
  counterContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  counterTextWrapper: { position: 'absolute', alignItems: 'center' },
  kalanZaman: { color: '#FFD700', fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  timeNum: { color: '#fff', fontSize: 26, fontWeight: '300', letterSpacing: 1 },
  labelRow: { flexDirection: 'row', gap: 18, marginTop: 4 },
  label: { color: '#aaa', fontSize: 10, fontWeight: '700' },
  forecastWrapper: { marginTop: 15 },
  forecastTitle: { color: '#FFD700', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
  forecastScroll: { paddingHorizontal: 20, gap: 12, paddingBottom: 10 },
  forecastCard: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12, borderRadius: 24, width: 125, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' },
  activeCard: { backgroundColor: 'rgba(255, 217, 0, 0.9)', borderColor: '#FFD700' },
  forecastDayText: { color: '#ccc', fontSize: 10, fontWeight: 'bold' },
  forecastDateText: { color: '#888', fontSize: 9, marginBottom: 12 },
  forecastTempText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  forecastDescText: { color: '#aaa', fontSize: 9, fontWeight: 'bold', marginTop: 4, textAlign: 'center' },
  humidityBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  humidityText: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 30, left: 20, right: 20, height: 75, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 25, overflow: 'hidden' },
  verticalDivider: { width: 1, height: '35%', backgroundColor: 'rgba(255,255,255,0.1)' },
  weatherInfoSmall: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottomBarSmallTitle: { color: '#888', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  bottomBarValue: { color: '#fff', fontSize: 10, fontWeight: '600' },
  liveText: { color: 'rgba(239, 68, 68, 1)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  pingContainer: { width: 12, height: 12, justifyContent: 'center', alignItems: 'center' },
  pingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(239, 68, 68, 1)' },
  pingCircle: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(239, 68, 68, 0.8)' },
});