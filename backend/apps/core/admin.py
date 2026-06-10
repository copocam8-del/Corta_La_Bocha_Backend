from django.contrib import admin

from .models import Profile, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "created_at")
    search_fields = ("name", "slug")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "tenant", "display_name", "created_at")
    search_fields = ("user__username", "tenant__name", "display_name")
