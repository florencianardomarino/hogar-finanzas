-- =====================================================================
-- MIGRACIÓN: correcciones de seguridad (RLS)
-- Ejecutar en el editor SQL de Supabase. Es idempotente y no modifica datos.
--
-- 1. household_members: ya nadie puede insertarse como admin en un hogar ajeno.
--    Solo el creador puede registrarse como admin de su hogar recién creado;
--    los invitados entran únicamente mediante public.join_household(código).
-- 2. households: solo el admin puede actualizar la configuración del hogar.
-- 3. profiles: solo se leen el propio perfil y los de quienes comparten hogar.
-- 4. Las funciones auxiliares fijan search_path (buena práctica en SECURITY DEFINER).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_household_member(household_uuid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = household_uuid AND user_id = auth.uid()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(household_uuid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = household_uuid AND user_id = auth.uid() AND role = 'admin'
    );
END;
$$;

-- El usuario creó el hogar y este todavía no tiene miembros (alta inicial del admin)
CREATE OR REPLACE FUNCTION public.can_bootstrap_household_admin(household_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.households h
        WHERE h.id = household_uuid AND h.created_by = auth.uid()
    ) AND NOT EXISTS (
        SELECT 1 FROM public.household_members m WHERE m.household_id = household_uuid
    );
$$;

-- El usuario comparte al menos un hogar con el perfil indicado
CREATE OR REPLACE FUNCTION public.shares_household_with(other_user UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.household_members a
        JOIN public.household_members b ON a.household_id = b.household_id
        WHERE a.user_id = auth.uid() AND b.user_id = other_user
    );
$$;

-- ---------------------------------------------------------------------
-- Unirse a un hogar con código de invitación (único camino para invitados)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_household(invite TEXT)
RETURNS TABLE (household_id UUID, household_name TEXT, already_member BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    h public.households%ROWTYPE;
    inserted INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO h FROM public.households
    WHERE invite_code = upper(btrim(invite));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_invite_code';
    END IF;

    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (h.id, auth.uid(), 'collaborator')
    ON CONFLICT (household_id, user_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;

    RETURN QUERY SELECT h.id, h.name, (inserted = 0);
END;
$$;

REVOKE ALL ON FUNCTION public.join_household(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_household(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Los usuarios pueden registrar su propia membresía (creador o invitado)" ON public.household_members;
DROP POLICY IF EXISTS "El creador puede registrarse como admin de su hogar nuevo" ON public.household_members;
CREATE POLICY "El creador puede registrarse como admin de su hogar nuevo"
    ON public.household_members FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND role = 'admin'
        AND public.can_bootstrap_household_admin(household_id)
    );

DROP POLICY IF EXISTS "Los miembros pueden ver la lista de integrantes del hogar" ON public.household_members;
CREATE POLICY "Los miembros pueden ver la lista de integrantes del hogar"
    ON public.household_members FOR SELECT
    USING (public.is_household_member(household_id));

-- ---------------------------------------------------------------------
-- households: solo admin actualiza
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Los miembros pueden actualizar la configuración del hogar" ON public.households;
DROP POLICY IF EXISTS "Solo el admin puede actualizar la configuración del hogar" ON public.households;
CREATE POLICY "Solo el admin puede actualizar la configuración del hogar"
    ON public.households FOR UPDATE
    USING (public.is_household_admin(id))
    WITH CHECK (public.is_household_admin(id));

-- ---------------------------------------------------------------------
-- profiles: lectura restringida
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Los perfiles son públicos para lectura" ON public.profiles;
DROP POLICY IF EXISTS "Perfil propio y de integrantes del mismo hogar" ON public.profiles;
CREATE POLICY "Perfil propio y de integrantes del mismo hogar"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.shares_household_with(id));
