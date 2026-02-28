import streamlit as st
import pandas as pd
import re

st.set_page_config(page_title="Gestión de Compras | Estancos", page_icon="🏢", layout="wide", initial_sidebar_state="collapsed")

st.markdown("""
<style>
    /* Clean UI */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    .stApp {
        background-color: #f8fafc;
        font-family: 'Inter', sans-serif;
    }
    
    /* Typography */
    .main-header {
        font-size: 2.8rem !important;
        font-weight: 800 !important;
        color: #0f172a;
        margin-bottom: 0rem !important;
        padding-bottom: 0rem !important;
        text-align: center;
    }
    
    .sub-header {
        font-size: 1.2rem !important;
        color: #64748b;
        margin-top: 0.5rem !important;
        margin-bottom: 2rem !important;
        text-align: center;
    }
    
    /* Upload Box */
    .stFileUploader {
        background-color: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
        border: 1px dashed #cbd5e1;
    }
    
    /* Buttons */
    .stButton > button {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        font-weight: 600;
        border-radius: 8px;
        border: none;
        padding: 0.6rem 1.2rem;
        box-shadow: 0 4px 6px -1px rgba(59,130,246,0.3);
        transition: all 0.2s;
    }
    .stButton > button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 8px -1px rgba(59,130,246,0.4);
    }
    .stButton > button:active {
        transform: translateY(0px);
    }
    
    /* Dividers & Text */
    hr {
        border-color: #e2e8f0;
    }
    h3 {
        color: #1e293b;
        font-weight: 700;
        margin-top: 1rem;
    }
</style>
""", unsafe_allow_html=True)

st.markdown('<h1 class="main-header">🏢 Centro de Liquidaciones</h1>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Gestiona ventas y calcula promociones de estancos de forma automatizada.</p>', unsafe_allow_html=True)

col_up1, col_up2, col_up3 = st.columns([1, 2, 1])
with col_up2:
    uploaded_file = st.file_uploader("📂 Sube tu archivo Excel de ventas diarias aquí", type=["xlsx", "xls"])

if uploaded_file is not None:
    st.write("---")
    
    # NUEVO: Lista de nombres de personas (comerciales) a ignorar si aparecen en la columna 'Referencia'
    COMERCIALES_IGNORAR = [
        "Jordi Perello", "Javier Guisado", "Mireia", "Marc", "Anna", "Joan"
    ]
    # También podemos ignorarlas si no tienen minúsculas ni números (pero mejor por lista para no equivocarse)
    
    try:
        import unicodedata
        
        def normalize_str(val):
            if pd.isna(val): return ""
            s = str(val).strip().upper()
            return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

        xl = pd.ExcelFile(uploaded_file)
        
        # Buscar en qué pestaña está la tabla (por defecto, probamos 'Ventas' si existe, si no la primera)
        hoja_objetivo = 'Ventas' if 'Ventas' in xl.sheet_names else xl.sheet_names[0]
        
        for sheet in xl.sheet_names:
            temp_df = pd.read_excel(uploaded_file, sheet_name=sheet, header=None, nrows=50)
            if any('EXPENDEDURIA' in normalize_str(val) for row in temp_df.values for val in row):
                hoja_objetivo = sheet
                break
                
        # Leemos la hoja correcta sin saltar filas, el escáner universal la encontrará
        df_raw = pd.read_excel(uploaded_file, sheet_name=hoja_objetivo, header=None)
        
        idx_expendeduria = None
        idx_referencia = None
        
        indice_fila_cabecera = None
        indices_actuales = [] 
        indices_totales = []

        # Ampliamos a buscar en TODO el documento (las primeras 30 filas de Pandas)
        for row_idx in range(min(30, len(df_raw))):
            row_values = [normalize_str(x) for x in df_raw.iloc[row_idx].values]
            
            for col_idx, val in enumerate(row_values):
                if 'EXPENDEDURIA' in val and idx_expendeduria is None:
                    idx_expendeduria = col_idx
                if 'REFERENCIA' in val and 'COD' not in val and idx_referencia is None:
                    idx_referencia = col_idx
                if val == 'ACTUAL':
                    if col_idx not in indices_actuales:
                        indices_actuales.append(col_idx)
                        indice_fila_cabecera = row_idx
                if 'TOTAL' in val and 'ACTUAL' in val:
                    if col_idx not in indices_totales:
                        indices_totales.append(col_idx)
        
        if idx_expendeduria is None or idx_referencia is None:
             # Si esto ocurre, obligamos a parar para evitar el cruce de datos y le enseñamos al usuario lo que vemos
             st.error("❌ AÚN NO ENCUENTRO LAS PALABRAS 'EXPENDEDURIA' O 'REFERENCIA'. Quizás están en otra fila.")
             st.write("Mira lo que estoy leyendo en la fila 3 (que debería ser tu fila 14 de Excel):")
             if len(df_raw) > 2:
                 st.write([str(x) for x in df_raw.iloc[2].values])
             st.stop()
            
        # 1. Cortar a partir de la fila siguiente a la cabecera
        encuentros_fila = []
        for r_idx in range(min(30, len(df_raw))):
            for val in df_raw.iloc[r_idx].values:
                if 'EXPENDEDURIA' in normalize_str(val):
                    encuentros_fila.append(r_idx)
        
        fila_inicio_datos = max(encuentros_fila) + 1 if encuentros_fila else 14
        
        df_limpio = pd.DataFrame()
        df_limpio['Expendeduria_Cruda'] = df_raw.iloc[fila_inicio_datos:, idx_expendeduria]
        df_limpio['Referencia'] = df_raw.iloc[fila_inicio_datos:, idx_referencia]
        
        df_limpio['Expendeduria_Limpia'] = df_limpio['Expendeduria_Cruda']
        
        # Limpieza 1: Propagar hacia abajo el estanco
        df_limpio['Expendeduria_Limpia'] = df_limpio['Expendeduria_Limpia'].fillna(method='ffill')
        
        # Limpieza 2: Borrar las filas que en el Estanco Original dicen "Total X"
        es_fila_total = df_limpio['Expendeduria_Cruda'].astype(str).str.upper().str.startswith('TOTAL')
        # Limpieza 3: Referencia en blanco
        es_referencia_vacia = df_limpio['Referencia'].isna() | (df_limpio['Referencia'].astype(str).str.strip() == '')
        
        df_limpio = df_limpio[~es_fila_total & ~es_referencia_vacia].copy()
        
        # N U E V O: Limpieza 4: Borrar referencias que sean nombres de comerciales o que parezcan cabeceras intermedias
        def es_nombre_ignorardo(ref):
            ref_str = str(ref).lower().strip()
            # 1. Ignorar explícitos
            for nom in COMERCIALES_IGNORAR:
                if nom.lower() in ref_str:
                    return True
            # 2. Heurística (si no tiene números y tiene muy pocas letras, como los comerciales vs referencias de tabaco que suelen ser largas o tener un número "10 TPD")
            return False

        df_limpio = df_limpio[~df_limpio['Referencia'].apply(es_nombre_ignorardo)].copy()

        # Construir columnas de meses
        meses_disponibles = {}
        
        if indices_actuales:
            contador = 1
            for col_idx in indices_actuales:
                nombre = f"Mes {contador}"
                df_limpio[nombre] = df_raw.iloc[fila_inicio_datos:, col_idx]
                meses_disponibles[nombre] = nombre
                contador += 1
                
            for col_idx in indices_totales:
                nombre = "Total Acumulado"
                df_limpio[nombre] = df_raw.iloc[fila_inicio_datos:, col_idx]
                meses_disponibles[nombre] = nombre
        else:
            # Fallback Definitivo basado en tu layout si falla el escaneo de 'Actual'
            nombre1 = "Mes 1 (Col G)"
            df_limpio[nombre1] = df_raw.iloc[fila_inicio_datos:, 6] # Col G es 6
            meses_disponibles[nombre1] = nombre1
            
            if df_raw.shape[1] > 10:
                nombre2 = "Mes 2 (Col K)"
                df_limpio[nombre2] = df_raw.iloc[fila_inicio_datos:, 10] # Col K es 10
                meses_disponibles[nombre2] = nombre2

        st.success("✅ Excel procesado. Se han limpiado filas de totales y nombres de comerciales (como Jordi Perello).")

        with st.expander("🔍 Pulsa para ver una muestra de los 5 primeros datos resultantes antes del filtro:"):
            st.dataframe(df_limpio.head(5))

        # --- F I L T R O S   Y   P R O C E S A M I E N T O ---
        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown('<h3>🎯 Configuración de Promociones</h3>', unsafe_allow_html=True)
        
        col_filtros1, col_filtros2, col_filtros3 = st.columns(3)
        
        with col_filtros1:
            busqueda_estanco = st.text_input("1️⃣ Busca por Estanco (opcional):", placeholder="Ej: ABRERA")
            
        with col_filtros2:
            nombres_meses = list(meses_disponibles.keys())
            if not nombres_meses: 
                nombres_meses = ["(No detectado automáticamente)"]
                
            columna_cantidad = st.selectbox("2️⃣ ¿Qué compras evaluar?", nombres_meses)
        
        with col_filtros3:
            tipo_promocion = st.selectbox(
                "3️⃣ ¿Qué promoción liquidar?",
                ["DON TOMAS NICARAGUA", "CAO MORTAL COIL", "Ambas Promociones (Tabla Resumen)"]
            )
            
        st.markdown("<br>", unsafe_allow_html=True)
        col_btn1, col_btn2, col_btn3 = st.columns([1, 2, 1])
        with col_btn2:
            calcular_btn = st.button("🚀 Calcular Liquidación", use_container_width=True)
            
        if calcular_btn and nombres_meses[0] != "(No detectado automáticamente)":
            
            if busqueda_estanco.strip():
                df_calc = df_limpio[df_limpio['Expendeduria_Limpia'].astype(str).str.contains(busqueda_estanco, case=False, na=False)].copy()
            else:
                df_calc = df_limpio.copy()
            
            def to_number(val):
                if pd.isna(val) or val is None: return 0.0
                if isinstance(val, (int, float)): return float(val)
                s = str(val).strip()
                if not s: return 0.0
                try:
                    s = s.replace('.', '').replace(',', '.')
                    return float(s)
                except:
                    return 0.0
                    
            df_calc['Cantidad_Num'] = df_calc[columna_cantidad].apply(to_number)
            df_calc = df_calc[df_calc['Cantidad_Num'] > 0]
            
            if df_calc.empty:
                st.warning("No hay compras > 0 con estos filtros en el mes seleccionado.")
            else:
                tabla_basica = df_calc[['Expendeduria_Limpia', 'Referencia', 'Cantidad_Num']].copy()
                tabla_basica.rename(columns={'Expendeduria_Limpia': 'Estanco', 'Cantidad_Num': 'Puros Comprados'}, inplace=True)
                
                def extraer_uds_caja(referencia):
                    import re
                    ref = str(referencia).upper()
                    matches = re.findall(r'\b(\d{2})\b', ref)
                    if matches:
                        valid_sizes = ['10', '15', '16', '20', '24', '25', '30', '40', '50']
                        for m in reversed(matches):
                            if m in valid_sizes:
                                return float(m)
                        return float(matches[-1]) 
                    return 20.0 
                    
                tabla_basica['Uds/Caja'] = tabla_basica['Referencia'].apply(extraer_uds_caja)
                tabla_basica['Cajas Físicas'] = (tabla_basica['Puros Comprados'] / tabla_basica['Uds/Caja']).round(2)
                
                st.markdown("### 📋 Listado de Compras (Resultados Base)")
                st.dataframe(tabla_basica, use_container_width=True)
                
                st.markdown("---")
                
                # --- CALCULAR PUNTOS ---
                def puros_don_tomas(row):
                    ref = str(row['Referencia']).upper()
                    ref = re.sub(' +', ' ', ref)
                    cant = row['Puros Comprados']
                    if "DON TOMAS" in ref and "NICARAGUA" in ref:
                        if "TORO" in ref or "LINDOS" in ref or "ROTHSCHILD" in ref or "ROBUSTO" in ref: 
                            return cant * 1.0
                    return 0.0

                def puntuar_don_tomas(row):
                    ref = str(row['Referencia']).upper()
                    ref = re.sub(' +', ' ', ref)
                    cant = row['Cajas Físicas']
                    if "DON TOMAS" in ref and "NICARAGUA" in ref:
                        if "TORO" in ref: return cant * 0.5
                        elif "LINDOS" in ref or "ROTHSCHILD" in ref or "ROBUSTO" in ref: return cant * 1.0
                    return 0.0

                def fisicas_don_tomas(row):
                    ref = str(row['Referencia']).upper()
                    ref = re.sub(' +', ' ', ref)
                    cant = row['Cajas Físicas']
                    if "DON TOMAS" in ref and "NICARAGUA" in ref:
                        if "TORO" in ref or "LINDOS" in ref or "ROTHSCHILD" in ref or "ROBUSTO" in ref: 
                            return cant * 1.0
                    return 0.0

                def pago_don_tomas(cajas):
                    if cajas >= 6: return 40
                    elif cajas >= 2: return 25
                    return 0

                def puntuar_cao(row):
                    ref = str(row['Referencia']).upper()
                    cant = row['Cajas Físicas']
                    if "MORTAL" in ref and "COIL" in ref: return cant * 1.0 
                    return 0.0
                
                def pago_cao(cajas):
                    return cajas * 10 

                tabla_basica['Puros_DonTomas'] = tabla_basica.apply(puros_don_tomas, axis=1)
                tabla_basica['Cajas_DonTomas'] = tabla_basica.apply(puntuar_don_tomas, axis=1)
                tabla_basica['Fisicas_DonTomas'] = tabla_basica.apply(fisicas_don_tomas, axis=1)
                tabla_basica['Cajas_CAO'] = tabla_basica.apply(puntuar_cao, axis=1)
                
                agrupado_general = tabla_basica.groupby('Estanco')[['Puros_DonTomas', 'Fisicas_DonTomas', 'Cajas_DonTomas', 'Cajas_CAO']].sum().reset_index()
                agrupado_general['Pts_DonTomas'] = agrupado_general['Cajas_DonTomas'].apply(pago_don_tomas)
                agrupado_general['Pts_CAO'] = agrupado_general['Cajas_CAO'].apply(pago_cao)
                agrupado_general['Total_Puntos'] = agrupado_general['Pts_DonTomas'] + agrupado_general['Pts_CAO']

                if tipo_promocion == "DON TOMAS NICARAGUA":
                    df_res = agrupado_general[agrupado_general['Fisicas_DonTomas'] > 0][['Estanco', 'Puros_DonTomas', 'Fisicas_DonTomas', 'Cajas_DonTomas', 'Pts_DonTomas']].copy()
                    df_res.rename(columns={'Puros_DonTomas': 'Puros Promocionables', 'Fisicas_DonTomas': 'Cajas Físicas Totales', 'Cajas_DonTomas': 'Cajas Computables (Toro=0.5)', 'Pts_DonTomas': 'Puntos A Pagar'}, inplace=True)
                    st.markdown("### 🏆 Resultado: DON TOMAS NICARAGUA")
                    st.info("💡 Recuerda tu regla: Las cajas de Toro cuentan como media (0.5). Por eso las Cajas Computables pueden ser menores a las Físicas.")
                    if df_res.empty: st.write("Ningún estanco seleccionado ha ganado la promoción.")
                    else: 
                        st.dataframe(df_res, use_container_width=True)
                        csv = df_res.to_csv(index=False).encode('utf-8-sig')
                        st.download_button("📥 Descargar Don Tomas", data=csv, file_name="DonTomas.csv", mime="text/csv")

                elif tipo_promocion == "CAO MORTAL COIL":
                    df_res = agrupado_general[agrupado_general['Cajas_CAO'] > 0][['Estanco', 'Cajas_CAO', 'Pts_CAO']].copy()
                    df_res.rename(columns={'Cajas_CAO': 'Cajas Válidas', 'Pts_CAO': 'Puntos A Pagar'}, inplace=True)
                    st.markdown("### 🐉 Resultado: CAO MORTAL COIL")
                    if df_res.empty: st.write("Ningún estanco compró Mortal Coil.")
                    else: 
                        st.dataframe(df_res, use_container_width=True)
                        csv = df_res.to_csv(index=False).encode('utf-8-sig')
                        st.download_button("📥 Descargar CAO", data=csv, file_name="CAOMortal.csv", mime="text/csv")

                elif tipo_promocion == "Ambas Promociones (Tabla Resumen)":
                    df_res = agrupado_general[agrupado_general['Total_Puntos'] > 0].copy()
                    st.markdown("### 💰 Resultado Completo: Liquidación Combinada")
                    if df_res.empty: st.write("Nadie gana promociones hoy.")
                    else: 
                        st.dataframe(df_res, use_container_width=True)
                        csv = df_res.to_csv(index=False).encode('utf-8-sig')
                        st.download_button("📥 Descargar Completo", data=csv, file_name="Combinado.csv", mime="text/csv")

    except Exception as e:
        st.error(f"Error crítico conectando con el Excel. Detalles de sistema: {e}")
